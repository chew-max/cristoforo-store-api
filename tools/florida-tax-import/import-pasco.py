import csv
import sqlite3
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

ZIP_PATH = (
    ROOT /
    "tax-data" /
    "PASCO_2026-07-01.zip"
)

OUTPUT_DB = (
    ROOT /
    "tax-data" /
    "pasco-tax.sqlite"
)


def normalize(value):
    if value is None:
        return ""

    return (
        str(value)
        .strip()
        .upper()
    )


def main():

    if not ZIP_PATH.exists():
        raise FileNotFoundError(
            f"Missing file: {ZIP_PATH}"
        )


    OUTPUT_DB.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()


    conn = sqlite3.connect(
        OUTPUT_DB
    )

    cursor = conn.cursor()


    cursor.execute(
        """
        CREATE TABLE addresses (
          zip TEXT NOT NULL,
          house_number TEXT NOT NULL,
          predir TEXT NOT NULL,
          street_name TEXT NOT NULL,
          street_suffix TEXT NOT NULL,
          postdir TEXT NOT NULL,
          city TEXT NOT NULL,
          county_id TEXT NOT NULL
        )
        """
    )


    cursor.execute(
        """
        CREATE INDEX idx_lookup
        ON addresses (
          zip,
          house_number,
          street_name
        )
        """
    )


    inserted = 0


    with zipfile.ZipFile(
        ZIP_PATH,
        "r"
    ) as archive:

        csv_files = [
            name
            for name
            in archive.namelist()
            if name.lower().endswith(
                ".csv"
            )
        ]


        if len(csv_files) != 1:
            raise RuntimeError(
                "Expected exactly one CSV in ZIP."
            )


        csv_name = csv_files[0]


        with archive.open(
            csv_name,
            "r"
        ) as raw_file:

            import io

            text_file = io.TextIOWrapper(
                raw_file,
                encoding="utf-8-sig",
                newline=""
            )


            reader = csv.DictReader(
                text_file
            )


            batch = []


            for row in reader:

                zip_code = normalize(
                    row["ZIP"]
                )

                house_number = normalize(
                    row["NUMBER"]
                )

                street_name = normalize(
                    row["STNAME"]
                )

                county_id = normalize(
                    row["COUNTYID"]
                )


                if (
                    not zip_code or
                    not house_number or
                    not street_name or
                    not county_id
                ):
                    continue


                batch.append(
                    (
                        zip_code,

                        house_number,

                        normalize(
                            row["PREDIR"]
                        ),

                        street_name,

                        normalize(
                            row["STSUFFIX"]
                        ),

                        normalize(
                            row["POSTDIR"]
                        ),

                        normalize(
                            row["MAILCITY"]
                        ),

                        county_id
                    )
                )


                if len(batch) >= 5000:

                    cursor.executemany(
                        """
                        INSERT INTO addresses (
                          zip,
                          house_number,
                          predir,
                          street_name,
                          street_suffix,
                          postdir,
                          city,
                          county_id
                        )
                        VALUES (
                          ?, ?, ?, ?, ?, ?, ?, ?
                        )
                        """,
                        batch
                    )

                    inserted += len(batch)

                    batch = []


                    print(
                        f"Imported {inserted:,} records..."
                    )


            if batch:

                cursor.executemany(
                    """
                    INSERT INTO addresses (
                      zip,
                      house_number,
                      predir,
                      street_name,
                      street_suffix,
                      postdir,
                      city,
                      county_id
                    )
                    VALUES (
                      ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    batch
                )

                inserted += len(batch)


    conn.commit()


    cursor.execute(
        """
        SELECT COUNT(*)
        FROM addresses
        """
    )

    total = cursor.fetchone()[0]


    print()
    print(
        "Import complete."
    )

    print(
        f"Records: {total:,}"
    )

    print(
        f"Database: {OUTPUT_DB}"
    )


    conn.close()


if __name__ == "__main__":
    main()