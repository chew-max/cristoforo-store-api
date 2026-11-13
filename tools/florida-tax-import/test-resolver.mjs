import {
  parseFloridaAddress
} from "../../src/tax/florida.js";

import {
  spawnSync
} from "node:child_process";

import {
  fileURLToPath
} from "node:url";

import {
  writeFileSync,
  unlinkSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import process from "node:process";


const DATABASE_NAME =
  "jekyll-commerce-orders";


const ROOT =
  fileURLToPath(
    new URL(
      "../../",
      import.meta.url
    )
  );


function sqlEscape(value) {
  return String(value)
    .replaceAll(
      "'",
      "''"
    );
}


function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}


function parseArgs() {
  const args =
    process.argv.slice(2);


  if (args.length < 3) {
    console.error();

    console.error(
      "Usage:"
    );

    console.error(
      'node test-resolver.mjs "5744 10th Avenue" "New Port Richey" "34652"'
    );

    console.error();

    process.exit(1);
  }


  return {
    address1: args[0],
    city: args[1],
    postalCode: args[2]
  };
}


function main() {
  const input =
    parseArgs();


  const parsed =
    parseFloridaAddress(
      input.address1
    );


  const zip =
    String(
      input.postalCode
    )
      .trim()
      .slice(0, 5);


  const city =
    normalize(
      input.city
    );


  console.log();

  console.log(
    "Florida Address Resolver Test"
  );

  console.log(
    "============================="
  );

  console.log();

  console.log(
    "Input:"
  );

  console.log(
    `  Address: ${input.address1}`
  );

  console.log(
    `  City:    ${input.city}`
  );

  console.log(
    `  ZIP:     ${zip}`
  );

  console.log();

  console.log(
    "Normalized:"
  );

  console.log(
    `  Number:  ${parsed.houseNumber}`
  );

  console.log(
    `  Predir:  ${parsed.predir || "(none)"}`
  );

  console.log(
    `  Street:  ${parsed.streetName}`
  );

  console.log(
    `  Suffix:  ${parsed.streetSuffix || "(none)"}`
  );

  console.log(
    `  Postdir: ${parsed.postdir || "(none)"}`
  );

  console.log();


  const query = `
SELECT
  a.county_id,
  c.county_name,
  c.surtax_rate
FROM fl_tax_addresses a
JOIN fl_tax_counties c
  ON c.county_id = a.county_id
WHERE
  a.zip = '${sqlEscape(zip)}'
  AND a.house_number = '${sqlEscape(parsed.houseNumber)}'
  AND a.predir = '${sqlEscape(parsed.predir)}'
  AND a.street_name = '${sqlEscape(parsed.streetName)}'
  AND a.street_suffix = '${sqlEscape(parsed.streetSuffix)}'
  AND a.postdir = '${sqlEscape(parsed.postdir)}'
  AND a.city = '${sqlEscape(city)}'
LIMIT 1;
  `.trim();


  const sqlFile =
    join(
      tmpdir(),
      `florida-resolver-${process.pid}.sql`
    );


  writeFileSync(
    sqlFile,
    query,
    {
      encoding: "utf8"
    }
  );


  console.log(
    "Querying remote D1..."
  );

  console.log();


  /*
   * On Windows, launch the .cmd file through
   * cmd.exe explicitly.
   *
   * The SQL itself is NOT passed through
   * cmd.exe; Wrangler reads it from a file.
   */
  let command;
  let args;


  if (
    process.platform === "win32"
  ) {
    command =
      process.env.ComSpec ||
      "cmd.exe";

    args = [
      "/d",
      "/s",
      "/c",
      "npx.cmd",
      "wrangler",
      "d1",
      "execute",
      DATABASE_NAME,
      "--remote",
      "--file",
      sqlFile
    ];
  } else {
    command =
      "npx";

    args = [
      "wrangler",
      "d1",
      "execute",
      DATABASE_NAME,
      "--remote",
      "--file",
      sqlFile
    ];
  }


  const result =
    spawnSync(
      command,
      args,
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: "inherit"
      }
    );


  try {
    unlinkSync(
      sqlFile
    );
  } catch {
    // Temporary cleanup failure is harmless.
  }


  if (result.error) {
    console.error();

    console.error(
      "Process error:"
    );

    console.error(
      result.error
    );

    process.exit(1);
  }


  if (result.status !== 0) {
    console.error();

    console.error(
      `Resolver test failed with exit code ${result.status}.`
    );

    process.exit(1);
  }


  console.log();

  console.log(
    "Expected Pasco tax:"
  );

  console.log(
    "  Florida state: 6.00%"
  );

  console.log(
    "  Pasco surtax:   1.00%"
  );

  console.log(
    "  Combined:       7.00%"
  );

  console.log();
}


main();