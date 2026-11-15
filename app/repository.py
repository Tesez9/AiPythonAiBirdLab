import csv
import io

from sqlalchemy import distinct, func, or_

from app.models import Analysis, BirdInfo
from app.serializers import analysis_to_dict, bird_info_to_dict


def find_info(db, species):
    if not species:
        return None

    return (
        db.query(BirdInfo)
        .filter(func.lower(BirdInfo.species) == species.strip().lower())
        .first()
    )


def get_analyses_data(db, query=None, skip=0, limit=50):
    rows_query = db.query(Analysis)

    if query:
        needle = f"%{query.strip()}%"
        rows_query = rows_query.filter(
            or_(
                Analysis.image_name.ilike(needle),
                Analysis.predicted_species.ilike(needle),
                Analysis.description.ilike(needle),
            )
        )

    total = rows_query.count()
    rows = (
        rows_query.order_by(Analysis.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "items": [analysis_to_dict(row) for row in rows],
    }


def get_analysis_data(db, analysis_id):
    row = db.get(Analysis, analysis_id)

    if row is None:
        return None

    return analysis_to_dict(row, full=True)


def get_stats_data(db):
    total = db.query(func.count(Analysis.id)).scalar() or 0
    unique_species = (
        db.query(func.count(distinct(Analysis.predicted_species))).scalar()
        or 0
    )
    average = db.query(func.avg(Analysis.confidence)).scalar() or 0
    highest = (
        db.query(Analysis)
        .order_by(Analysis.confidence.desc(), Analysis.id.asc())
        .first()
    )
    lowest = (
        db.query(Analysis)
        .order_by(Analysis.confidence.asc(), Analysis.id.asc())
        .first()
    )
    top = (
        db.query(
            Analysis.predicted_species,
            func.count(Analysis.id).label("count"),
        )
        .group_by(Analysis.predicted_species)
        .order_by(
            func.count(Analysis.id).desc(),
            Analysis.predicted_species.asc(),
        )
        .limit(5)
        .all()
    )

    return {
        "total": total,
        "unique_species": unique_species,
        "average_confidence": round(float(average), 4),
        "highest": analysis_to_dict(highest) if highest else None,
        "lowest": analysis_to_dict(lowest) if lowest else None,
        "top_species": [
            {"species": species, "count": count}
            for species, count in top
        ],
    }


def build_csv_content(db):
    rows = db.query(Analysis).order_by(Analysis.id).all()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "image_name",
            "predicted_species",
            "confidence",
            "analysis_date",
            "description",
        ]
    )

    for row in rows:
        writer.writerow(
            [
                row.image_name,
                row.predicted_species,
                f"{row.confidence:.4f}",
                row.analysis_date.isoformat()
                if row.analysis_date
                else "",
                row.description,
            ]
        )

    return output.getvalue()


def get_birds_data(db):
    rows = db.query(BirdInfo).order_by(BirdInfo.species.asc()).all()
    return [bird_info_to_dict(row) for row in rows]
