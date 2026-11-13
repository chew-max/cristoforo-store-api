import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

DB_PATH = (
    ROOT /
    "tax-data" /
    "pasco-tax.sqlite"
)

OUTPUT_DIR = (
    ROOT /
    "tax-data" /
    "pasco-sql"
)


ROWS_PER_FILE = 5000


def sql_escape(value):

    if value is None:
        return ""

    return str(
        value
    ).replace(
        "'",
        "''"
    )


def main():

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )


    conn = sqlite3.connect(
        DB_PATH
    )


    cursor = conn.cursor()


    cursor.execute(
        """
        SELECT
          zip,
          house_number,
          predir,
          street_name,
          street_suffix,
          postdir,
          city,
          county_id

        FROM addresses

        ORDER BY
          zip,
          house_number,
          street_name
        """
    )


    file_number = 1
    row_count = 0
    file_row_count = 0

    output = None


    def open_file(number):

        path = (
            OUTPUT_DIR /
            f"pasco-{number:03}.sql"
        )

        print(
            f"Creating {path.name}"
        )

        handle = open(
            path,
            "w",
            encoding="utf-8"
        )

        handle.write(
            "BEGIN TRANSACTION;\n"
        )

        return handle


    output = open_file(
        file_number
    )


    for row in cursor:

        if (
            file_row_count >=
            ROWS_PER_FILE
        ):

            output.write(
                "COMMIT;\n"
            )

            output.close()

            file_number += 1
            file_row_count = 0

            output = open_file(
                file_number
            )


        values = ", ".join(
            "'" +
            sql_escape(value) +
            "'"
            for value in row
        )


        output.write(
            """
INSERT OR IGNORE INTO fl_tax_addresses (
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
"""
        )

        output.write(
            f"  {values}\n"
        )

        output.write(
            ");\n"
        )


        row_count += 1
        file_row_count += 1


    if output:

        output.write(
            "COMMIT;\n"
        )

        output.close()


    conn.close()


    print()
    print(
        f"Exported {row_count:,} records."
    )

    print(
        f"Created {file_number} SQL files."
    )


if __name__ == "__main__":
    main()