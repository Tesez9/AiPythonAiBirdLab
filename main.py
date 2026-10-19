import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from transformers import pipeline

MODEL_NAME = "dennisjooo/Birds-Classifier-EfficientNetB2"
DB_FILE = "bird_lab.db"
CSV_FILE = "bird_analysis.csv"
INPUT_DIR = Path("input")
IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"]
CONFIDENCE_LIMIT = 0.6

ALIASES = {
    "crested shriketit": "Crested Shrike-tit",
    "trumpter swan": "Trumpeter Swan",
}

print("Завантаження моделі...")

try:
    classifier = pipeline("image-classification", model=MODEL_NAME)
    print("Модель завантажено.")
except Exception as error:
    classifier = None
    print("Не вдалося завантажити модель:")
    print(error)

db = sqlite3.connect(DB_FILE)
db.row_factory = sqlite3.Row
cur = db.cursor()

cur.execute("""
    CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_name TEXT,
        predicted_species TEXT,
        confidence REAL,
        top3 TEXT,
        analysis_date TEXT,
        description TEXT,
        extra_info TEXT,
        source TEXT
    )
""")

cur.execute("""
    CREATE TABLE IF NOT EXISTS bird_info (
        species TEXT PRIMARY KEY,
        ukrainian TEXT,
        scientific TEXT,
        family TEXT,
        habitat TEXT,
        range TEXT,
        diet TEXT,
        size TEXT,
        facts TEXT,
        status TEXT,
        description TEXT,
        source TEXT
    )
""")
db.commit()


def normalize_name(name):
    return str(name).strip().lower()


def display_species(label):
    key = normalize_name(label)

    if key in ALIASES:
        return ALIASES[key]

    return str(label).strip().title()


def find_info(label):
    key = normalize_name(label)

    if key in ALIASES:
        key = normalize_name(ALIASES[key])

    row = cur.execute(
        "SELECT * FROM bird_info WHERE lower(species)=?",
        (key,),
    ).fetchone()

    if row is None:
        return None

    return dict(row)


def show_info(info):
    if info is None:
        print("Інформація про цей вид відсутня.")
        return

    print("Українська назва:", info.get("ukrainian", "—"))
    print("Наукова назва:", info.get("scientific", "—"))
    print("Родина:", info.get("family", "—"))
    print("Середовище існування:", info.get("habitat", "—"))
    print("Поширення:", info.get("range", "—"))
    print("Живлення:", info.get("diet", "—"))
    print("Розміри:", info.get("size", "—"))
    print("Цікаві факти:", info.get("facts", "—"))
    print("Природоохоронний статус:", info.get("status", "—"))
    print("Джерело:", info.get("source", "—"))


def load_image(path):
    file = Path(path)

    if not file.is_file():
        print("Файл не знайдено:", path)
        return None

    if file.suffix.lower() not in IMAGE_EXTENSIONS:
        print("Підтримуються тільки JPG, JPEG, PNG")
        return None

    try:
        with Image.open(file) as image:
            return image.convert("RGB")
    except (UnidentifiedImageError, OSError):
        print("Некоректний файл зображення:", path)
        return None


def top3_text(result):
    parts = []

    for item in result[:3]:
        parts.append(
            display_species(item["label"]) + ": " + f"{item['score'] * 100:.1f}%"
        )

    return " | ".join(parts)


def print_result(result):
    top = result[0]
    species = display_species(top["label"])
    confidence = top["score"]
    info = find_info(top["label"])

    print("\n===== RESULT =====")
    print("Вид:", species)
    print("Впевненість:", f"{confidence * 100:.1f}%")

    if confidence < CONFIDENCE_LIMIT:
        print("Статус: припущення (низька впевненість)")
    else:
        print("Статус: визначено")

    print("Топ-3:")

    for item in result[:3]:
        print("-", display_species(item["label"]), f"{item['score'] * 100:.1f}%")

    print("\n===== INFO =====")
    show_info(info)

    return species, confidence, info


def save_result(image_name, species, confidence, result, info):
    top3 = top3_text(result)

    if info:
        description = info.get("description", "Опис відсутній.")
        extra_info = json.dumps(info, ensure_ascii=False)
        source = info.get("source", "")
    else:
        description = "Інформація про вид відсутня."
        extra_info = ""
        source = ""

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cur.execute("""
        INSERT INTO analyses
        (image_name, predicted_species, confidence, top3, analysis_date, description, extra_info, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        image_name,
        species,
        confidence,
        top3,
        now,
        description,
        extra_info,
        source,
    ))
    db.commit()

    print("Запис додано в базу. ID:", cur.lastrowid)


def analyze_one():
    print("\n===== ANALYZE ONE PHOTO =====")

    if classifier is None:
        print("Модель не завантажена.")
        return

    path = input("Шлях до фото: ").strip().strip('"')
    image = load_image(path)

    if image is None:
        return

    try:
        result = classifier(image, top_k=3)
    except Exception as error:
        print("Помилка аналізу:")
        print(error)
        return

    species, confidence, info = print_result(result)
    save_result(Path(path).name, species, confidence, result, info)


def collect_photos():
    photos = []

    if not INPUT_DIR.is_dir():
        return photos

    for file in sorted(INPUT_DIR.iterdir()):
        if file.is_file() and file.suffix.lower() in IMAGE_EXTENSIONS:
            photos.append(file)

    return photos


def analyze_all():
    print("\n===== ANALYZE ALL PHOTOS =====")

    if classifier is None:
        print("Модель не завантажена.")
        return

    photos = collect_photos()

    if not photos:
        print("Фото в папці input/ не знайдено.")
        return

    count = 0

    for file in photos:
        print("\nФото:", file.name)
        image = load_image(file)

        if image is None:
            continue

        try:
            result = classifier(image, top_k=3)
        except Exception as error:
            print("Помилка аналізу:")
            print(error)
            continue

        species, confidence, info = print_result(result)
        save_result(file.name, species, confidence, result, info)
        count += 1

    print("\nПроаналізовано фото:", count)


def show_history():
    rows = cur.execute("""
        SELECT id, image_name, predicted_species, confidence, analysis_date
        FROM analyses
        ORDER BY id DESC
    """).fetchall()

    if not rows:
        print("Історія порожня.")
        return

    print("\n===== HISTORY =====")

    for row in rows:
        print(
            f"ID:{row[0]} | {row[1]} | {row[2]} | "
            f"{row[3] * 100:.1f}% | {row[4]}"
        )

    record_id = input("\nID для деталей (Enter - назад): ").strip()

    if record_id == "":
        return

    if not record_id.isdigit():
        print("Некоректний ID.")
        return

    row = cur.execute("SELECT * FROM analyses WHERE id=?", (record_id,)).fetchone()

    if row is None:
        print("Запис не знайдено.")
        return

    print("\nID:", row[0])
    print("Файл:", row[1])
    print("Вид:", row[2])
    print("Впевненість:", f"{row[3] * 100:.1f}%")
    print("Топ-3:", row[4])
    print("Дата:", row[5])
    print("Опис:", row[6])
    print("Джерело:", row[8])

    if row[7]:
        try:
            info = json.loads(row[7])
        except json.JSONDecodeError:
            info = None

        if info:
            print("\n===== INFO =====")
            show_info(info)


def search_by_name():
    name = input("Назва виду для пошуку: ").strip().lower()

    if name == "":
        return

    rows = cur.execute("""
        SELECT id, image_name, predicted_species, confidence, analysis_date, description, extra_info
        FROM analyses
        ORDER BY id DESC
    """).fetchall()

    found = 0

    for row in rows:
        text = " ".join(str(value) for value in row if value is not None).lower()

        if name in text:
            print(
                f"ID:{row[0]} | {row[1]} | {row[2]} | "
                f"{row[3] * 100:.1f}% | {row[4]}"
            )
            found += 1

    if found == 0:
        print("Нічого не знайдено.")
    else:
        print("Знайдено записів:", found)


def delete_record():
    record_id = input("ID для видалення: ").strip()

    if not record_id.isdigit():
        print("Некоректний ID.")
        return

    cur.execute("DELETE FROM analyses WHERE id=?", (int(record_id),))
    db.commit()

    print("Видалено записів:", cur.rowcount)


def export_csv():
    rows = cur.execute("""
        SELECT image_name, predicted_species, confidence, analysis_date, description
        FROM analyses
        ORDER BY id
    """).fetchall()

    with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.writer(file)
        writer.writerow([
            "image_name",
            "predicted_species",
            "confidence",
            "analysis_date",
            "description",
        ])

        for row in rows:
            writer.writerow([
                row[0],
                row[1],
                f"{row[2]:.4f}",
                row[3],
                row[4],
            ])

    print("Експортовано", len(rows), "рядків у", CSV_FILE)


def show_statistics():
    total = cur.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]

    if total == 0:
        print("Статистика порожня.")
        return

    unique_species = cur.execute(
        "SELECT COUNT(DISTINCT predicted_species) FROM analyses"
    ).fetchone()[0]

    average = cur.execute("SELECT AVG(confidence) FROM analyses").fetchone()[0]

    highest = cur.execute("""
        SELECT predicted_species, image_name, confidence, analysis_date
        FROM analyses
        ORDER BY confidence DESC, id ASC
        LIMIT 1
    """).fetchone()

    lowest = cur.execute("""
        SELECT predicted_species, image_name, confidence, analysis_date
        FROM analyses
        ORDER BY confidence ASC, id ASC
        LIMIT 1
    """).fetchone()

    top = cur.execute("""
        SELECT predicted_species, COUNT(*)
        FROM analyses
        GROUP BY predicted_species
        ORDER BY COUNT(*) DESC, predicted_species ASC
        LIMIT 5
    """).fetchall()

    print("\n===== STATISTICS =====")
    print("Всього аналізів:", total)
    print("Унікальних видів:", unique_species)
    print("Середня впевненість:", f"{average * 100:.1f}%")
    print(
        "Найвища впевненість:",
        f"{highest[0]} - {highest[2] * 100:.1f}% ({highest[1]}, {highest[3]})",
    )
    print(
        "Найнижча впевненість:",
        f"{lowest[0]} - {lowest[2] * 100:.1f}% ({lowest[1]}, {lowest[3]})",
    )
    print("Найчастіші види:")

    for species, count in top:
        print("-", species + ":", count)


def main():
    if classifier is None:
        print("Модель недоступна. Перевірте встановлення transformers і torch.")
        return

    print("=== AI Bird Lab ===")
    print("Модель:", MODEL_NAME)
    print("Класифікація фото птахів і база даних.\n")

    while True:
        print("""
================================
         AI BIRD LAB
================================
1. Аналіз одного фото
2. Пакетний аналіз фото (input/)
3. Історія
4. Пошук за назвою
5. Видалити запис
6. Експорт CSV
7. Статистика
0. Вихід
""")

        try:
            choice = input("Оберіть пункт: ").strip()
        except EOFError:
            print("\nЗавершення.")
            break

        if choice == "1":
            analyze_one()
        elif choice == "2":
            analyze_all()
        elif choice == "3":
            show_history()
        elif choice == "4":
            search_by_name()
        elif choice == "5":
            delete_record()
        elif choice == "6":
            export_csv()
        elif choice == "7":
            show_statistics()
        elif choice == "0":
            print("Програму завершено.")
            break
        else:
            print("Невірний пункт меню.")

    db.close()


if __name__ == "__main__":
    main()
