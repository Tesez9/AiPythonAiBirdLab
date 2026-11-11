import asyncio
import json
import os
import time

import aio_pika
from sqlalchemy import inspect

from backend import (
    SessionLocal,
    build_csv_content,
    engine,
    get_analyses_data,
    get_analysis_data,
    get_birds_data,
    get_stats_data,
)

RABBIT_URL = os.getenv("RABBIT_URL", "amqp://guest:guest@127.0.0.1/")
QUEUE_NAME = "bird_requests"


def wait_for_database():
    while True:
        try:
            tables = inspect(engine).get_table_names()
        except Exception as error:
            print("Database is not ready:", error, flush=True)
            time.sleep(2)
            continue

        if "analyses" in tables:
            print("Database is ready", flush=True)
            return

        print("Waiting for database schema...", flush=True)
        time.sleep(2)


def execute_action(data):
    action = data.get("action")

    with SessionLocal() as db:
        if action == "history":
            return get_analyses_data(
                db,
                query=data.get("query"),
                skip=int(data.get("skip", 0)),
                limit=int(data.get("limit", 50)),
            )

        if action == "analysis":
            analysis = get_analysis_data(db, int(data["id"]))

            if analysis is None:
                return {"__error__": "Analysis not found", "__status__": 404}

            return analysis

        if action == "stats":
            return get_stats_data(db)

        if action == "export":
            return {"csv": build_csv_content(db)}

        if action == "birds":
            return get_birds_data(db)

        if action == "ping":
            return {"status": "ok"}

        return {"__error__": "Unknown action", "__status__": 400}


async def connect_rabbit():
    while True:
        try:
            print("Connecting to RabbitMQ...", flush=True)
            connection = await aio_pika.connect_robust(RABBIT_URL)
            print("RabbitMQ connected", flush=True)
            return connection
        except Exception as error:
            print("RabbitMQ is not ready:", error, flush=True)
            print("Retry in 3 seconds...", flush=True)
            await asyncio.sleep(3)


async def main():
    wait_for_database()
    connection = await connect_rabbit()
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)

    queue = await channel.declare_queue(QUEUE_NAME, durable=True)

    print("RabbitMQ worker started", flush=True)
    print(f"Waiting for messages in queue: {QUEUE_NAME}", flush=True)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                print("Message received:", message.body.decode("utf-8"), flush=True)

                try:
                    data = json.loads(message.body.decode("utf-8"))
                    result = execute_action(data)
                except Exception as error:
                    print("Worker error:", error, flush=True)
                    result = {"__error__": str(error), "__status__": 500}

                if not message.reply_to:
                    continue

                response = aio_pika.Message(
                    body=json.dumps(
                        result,
                        ensure_ascii=False,
                        default=str,
                    ).encode("utf-8"),
                    correlation_id=message.correlation_id,
                    content_type="application/json",
                )

                await channel.default_exchange.publish(
                    response,
                    routing_key=message.reply_to,
                )

                print("Response sent", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
