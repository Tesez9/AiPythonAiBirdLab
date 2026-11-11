import asyncio
import json
import os
import uuid

import aio_pika

RABBIT_URL = os.getenv("RABBIT_URL", "amqp://guest:guest@127.0.0.1/")
QUEUE_NAME = "bird_requests"
REQUEST_TIMEOUT = float(os.getenv("RABBIT_TIMEOUT", "5"))


async def _request(data: dict) -> dict:
    connection = await aio_pika.connect_robust(RABBIT_URL)

    try:
        channel = await connection.channel()
        await channel.declare_queue(QUEUE_NAME, durable=True)

        callback_queue = await channel.declare_queue(
            exclusive=True,
            auto_delete=True,
        )

        correlation_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        future = loop.create_future()

        async def on_response(message):
            if message.correlation_id != correlation_id:
                return

            try:
                result = json.loads(message.body.decode("utf-8"))
            except json.JSONDecodeError as error:
                if not future.done():
                    future.set_exception(error)
                return

            if not future.done():
                future.set_result(result)

        await callback_queue.consume(on_response, no_ack=True)

        message = aio_pika.Message(
            body=json.dumps(data, ensure_ascii=False).encode("utf-8"),
            correlation_id=correlation_id,
            reply_to=callback_queue.name,
            content_type="application/json",
        )

        await channel.default_exchange.publish(
            message,
            routing_key=QUEUE_NAME,
        )

        return await future
    finally:
        try:
            await connection.close()
        except Exception:
            pass


async def rabbit_request(data: dict, timeout: float | None = None) -> dict:
    try:
        return await asyncio.wait_for(
            _request(data),
            timeout=timeout or REQUEST_TIMEOUT,
        )
    except asyncio.TimeoutError as error:
        raise TimeoutError("RabbitMQ request timed out") from error
