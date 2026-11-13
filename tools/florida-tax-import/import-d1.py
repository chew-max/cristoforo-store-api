import argparse
import csv
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

DEFAULT_ZIP = (
    ROOT
    / "tax-data"
    / "PASCO_2026-07-01.zip"
)

STATE_FILE = (
    ROOT
    / "tax-data"
    / "pasco-import-state.json"
)


DATABASE_NAME = None
WRANGLER_ENV = None


def normalize(value):
    if value is None:
        return ""

    return (
        str(value)
        .strip()
        .upper()
    )


def sql_escape(value):
    return (
        str(value)
        .replace(
            "'",
            "''"
        )
    )


def sql_string(value):
    return (
        "'"
        + sql_escape(value)
        + "'"
    )


def get_npx_command():
    if os.name == "nt":
        return "npx.cmd"

    return "npx"


def load_state():
    if not STATE_FILE.exists():
        return {
            "rows_processed": 0,
            "batches_completed": 0
        }

    with open(
        STATE_FILE,
        "r",
        encoding="utf-8"
    ) as handle:
        return json.load(handle)


def save_state(
    rows_processed,
    batches_completed
):
    STATE_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        STATE_FILE,
        "w",
        encoding="utf-8"
    ) as handle:
        json.dump(
            {
                "rows_processed": rows_processed,
                "batches_completed": batches_completed
            },
            handle,
            indent=2
        )


def create_insert_statement(rows):
    values = []

    for row in rows:
        values.append(
            "("
            + ", ".join(
                sql_string(value)
                for value in row
            )
            + ")"
        )

    return (
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
VALUES
"""
        + ",\n".join(values)
        + ";\n"
    )


def create_batch_sql(
    rows,
    rows_per_insert
):
    parts = []

    for index in range(
        0,
        len(rows),
        rows_per_insert
    ):
        chunk = rows[
            index:
            index + rows_per_insert
        ]

        parts.append(
            create_insert_statement(
                chunk
            )
        )

    return "\n".join(parts)


def send_batch_to_d1(
    sql_text,
    remote=True
):
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".sql",
            delete=False
        ) as temp_file:
            temp_file.write(sql_text)
            temp_path = temp_file.name
    
        command = [
            get_npx_command(),
            "wrangler",
            "d1",
            "execute",
            DATABASE_NAME
        ]
    
        if WRANGLER_ENV:
            command.extend(
                [
                    "--env",
                    WRANGLER_ENV
                ]
            )
    
        if remote:
            command.append("--remote")
        else:
            command.append("--local")
    
        command.extend(
            [
                "--file",
                temp_path
            ]
        )
    
        print(
            "Running:",
            " ".join(command)
        )
    
        wrangler_env = os.environ.copy()
        wrangler_env["CI"] = "true"
    
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=wrangler_env
        )
    
        if result.returncode != 0:
            raise RuntimeError(
                "Wrangler D1 import failed "
                f"with exit code {result.returncode}."
            )
    
    finally:
        if (
            temp_path
            and os.path.exists(temp_path)
        ):
            os.remove(temp_path)


def extract_address_row(row):
    zip_code = normalize(
        row.get("ZIP")
    )

    house_number = normalize(
        row.get("NUMBER")
    )

    predir = normalize(
        row.get("PREDIR")
    )

    street_name = normalize(
        row.get("STNAME")
    )

    street_suffix = normalize(
        row.get("STSUFFIX")
    )

    postdir = normalize(
        row.get("POSTDIR")
    )

    city = normalize(
        row.get("MAILCITY")
    )

    county_id = normalize(
        row.get("COUNTYID")
    )

    if not zip_code:
        return None

    if not house_number:
        return None

    if not street_name:
        return None

    if not county_id:
        return None

    return (
        zip_code,
        house_number,
        predir,
        street_name,
        street_suffix,
        postdir,
        city,
        county_id
    )


def upload_batch(
    batch,
    rows_per_insert,
    remote,
    run_batch_number,
    absolute_rows_processed,
    batches_completed
):
    sql_text = create_batch_sql(
        batch,
        rows_per_insert
    )

    print(
        "----------------------------------------"
    )

    print(
        f"Uploading run batch {run_batch_number}"
    )

    print(
        f"Rows attempted in batch: {len(batch):,}"
    )

    print(
        "Source valid-row range: "
        f"{absolute_rows_processed + 1:,}"
        " - "
        f"{absolute_rows_processed + len(batch):,}"
    )

    send_batch_to_d1(
        sql_text,
        remote=remote
    )

    absolute_rows_processed += len(batch)
    batches_completed += 1

    save_state(
        absolute_rows_processed,
        batches_completed
    )

    print(
        "Checkpoint after successful D1 call: "
        f"{absolute_rows_processed:,} source rows"
    )

    print()

    return (
        absolute_rows_processed,
        batches_completed
    )


def import_zip(
    zip_path,
    batch_size,
    rows_per_insert,
    resume,
    remote,
    limit,
    start_row
):
    if not zip_path.exists():
        raise FileNotFoundError(
            f"ZIP file not found: {zip_path}"
        )

    if resume:
        state = load_state()

        skip_rows = int(
            state.get(
                "rows_processed",
                0
            )
        )

        batches_completed = int(
            state.get(
                "batches_completed",
                0
            )
        )

        start_mode = "CHECKPOINT RESUME"

    elif start_row is not None:
        skip_rows = start_row
        batches_completed = 0
        start_mode = "EXPLICIT START ROW"

    else:
        skip_rows = 0
        batches_completed = 0
        start_mode = "BEGINNING"

    print()
    print(
        "Florida D1 Tax Import"
    )

    print(
        "====================="
    )

    print(
        f"Source: {zip_path}"
    )

    print(
        f"Database: {DATABASE_NAME}"
    )

    print(
        "Target:",
        "REMOTE"
        if remote
        else "LOCAL"
    )

    print(
        f"Batch size: {batch_size:,}"
    )

    print(
        f"Rows per INSERT: {rows_per_insert:,}"
    )

    print(
        f"Start mode: {start_mode}"
    )

    print(
        f"Starting after valid source row: {skip_rows:,}"
    )

    if limit is not None:
        print(
            f"Maximum rows to attempt: {limit:,}"
        )
    else:
        print(
            "Maximum rows to attempt: no limit"
        )

    print()

    source_rows_seen = 0
    valid_rows_seen = 0
    rows_attempted_this_run = 0

    absolute_rows_processed = skip_rows

    run_batch_number = 0

    batch = []

    with zipfile.ZipFile(
        zip_path,
        "r"
    ) as archive:

        csv_files = [
            name
            for name in archive.namelist()
            if name.lower().endswith(
                ".csv"
            )
        ]

        if len(csv_files) != 1:
            raise RuntimeError(
                "Expected exactly one CSV file in ZIP."
            )

        csv_name = csv_files[0]

        print(
            f"CSV: {csv_name}"
        )

        print()

        with archive.open(
            csv_name,
            "r"
        ) as raw_file:

            text_file = io.TextIOWrapper(
                raw_file,
                encoding="utf-8-sig",
                newline=""
            )

            reader = csv.DictReader(
                text_file
            )

            for row in reader:
                source_rows_seen += 1

                address_row = extract_address_row(
                    row
                )

                if not address_row:
                    continue

                valid_rows_seen += 1

                if valid_rows_seen <= skip_rows:
                    continue

                if (
                    limit is not None
                    and rows_attempted_this_run
                    >= limit
                ):
                    break

                batch.append(
                    address_row
                )

                if (
                    limit is not None
                    and (
                        rows_attempted_this_run
                        + len(batch)
                    ) >= limit
                ):
                    remaining = (
                        limit
                        - rows_attempted_this_run
                    )

                    batch = batch[
                        :remaining
                    ]

                if len(batch) >= batch_size:
                    run_batch_number += 1

                    (
                        absolute_rows_processed,
                        batches_completed
                    ) = upload_batch(
                        batch=batch,
                        rows_per_insert=rows_per_insert,
                        remote=remote,
                        run_batch_number=run_batch_number,
                        absolute_rows_processed=(
                            absolute_rows_processed
                        ),
                        batches_completed=(
                            batches_completed
                        )
                    )

                    rows_attempted_this_run += len(
                        batch
                    )

                    batch = []

                if (
                    limit is not None
                    and rows_attempted_this_run
                    >= limit
                ):
                    break

            if batch:
                run_batch_number += 1

                (
                    absolute_rows_processed,
                    batches_completed
                ) = upload_batch(
                    batch=batch,
                    rows_per_insert=rows_per_insert,
                    remote=remote,
                    run_batch_number=run_batch_number,
                    absolute_rows_processed=(
                        absolute_rows_processed
                    ),
                    batches_completed=(
                        batches_completed
                    )
                )

                rows_attempted_this_run += len(
                    batch
                )

    print()
    print(
        "========================================"
    )

    print(
        "Import run finished."
    )

    print(
        "Rows ATTEMPTED this run: "
        f"{rows_attempted_this_run:,}"
    )

    print(
        "Final source checkpoint: "
        f"{absolute_rows_processed:,}"
    )

    print(
        "Successful D1 batches this run: "
        f"{run_batch_number:,}"
    )

    print()

    print(
        "NOTE:"
    )

    print(
        "Rows attempted is NOT the same as "
        "rows inserted."
    )

    print(
        "INSERT OR IGNORE may cause D1 to "
        "skip rows that already exist."
    )

    print(
        "Verify actual database row count "
        "separately after the run."
    )

    print(
        "========================================"
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Import Florida DOR address data "
            "into Cloudflare D1."
        )
    )

    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_ZIP
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=2000
    )

    parser.add_argument(
        "--rows-per-insert",
        type=int,
        default=100
    )

    parser.add_argument(
        "--resume",
        action="store_true"
    )

    parser.add_argument(
        "--start-row",
        type=int,
        default=None,
        help=(
            "Skip this many valid source rows "
            "before starting the import."
        )
    )

    parser.add_argument(
        "--local",
        action="store_true"
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None
    )

    parser.add_argument(
        "--reset",
        action="store_true"
    )
    parser.add_argument(
        "--database",
        required=True,
        help="D1 database name or binding."
    )

    parser.add_argument(
        "--env",
        dest="wrangler_env",
        default=None,
        help="Optional Wrangler environment, such as sandbox."
    )
    args = parser.parse_args()
    
    global DATABASE_NAME
    global WRANGLER_ENV

    DATABASE_NAME = args.database
    WRANGLER_ENV = args.wrangler_env

    if args.reset:
        if STATE_FILE.exists():
            STATE_FILE.unlink()

            print(
                "Import checkpoint reset."
            )

        else:
            print(
                "No checkpoint file exists."
            )

        return

    if args.batch_size < 1:
        raise ValueError(
            "batch-size must be at least 1."
        )

    if args.rows_per_insert < 1:
        raise ValueError(
            "rows-per-insert must be at least 1."
        )

    if (
        args.limit is not None
        and args.limit < 1
    ):
        raise ValueError(
            "limit must be at least 1."
        )

    if (
        args.start_row is not None
        and args.start_row < 0
    ):
        raise ValueError(
            "start-row cannot be negative."
        )

    if (
        args.resume
        and args.start_row is not None
    ):
        raise ValueError(
            "--resume and --start-row "
            "cannot be used together."
        )

    import_zip(
        zip_path=args.file,
        batch_size=args.batch_size,
        rows_per_insert=args.rows_per_insert,
        resume=args.resume,
        remote=not args.local,
        limit=args.limit,
        start_row=args.start_row
    )


if __name__ == "__main__":
    try:
        main()

    except KeyboardInterrupt:
        print()
        print()

        print(
            "Import stopped by user."
        )

        print(
            "The last successful checkpoint "
            "has been preserved."
        )

        print(
            "Run again with --resume "
            "to continue from that checkpoint, "
            "or use --start-row to target "
            "a specific source range."
        )

        sys.exit(130)
