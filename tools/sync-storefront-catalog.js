import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const backendRoot =
  process.cwd();

const frontendRoot =
  path.resolve(
    backendRoot,
    process.env.STOREFRONT_REPO_PATH ||
      "../jekyll-commerce-starter"
  );

const generatedCatalog =
  path.join(
    backendRoot,
    "dist",
    "commerce-catalog.json"
  );

const frontendDataDirectory =
  path.join(
    frontendRoot,
    "_data"
  );

const frontendCatalog =
  path.join(
    frontendDataDirectory,
    "commerce-catalog.json"
  );


function fail(message) {
  console.error("");
  console.error("CATALOG SYNC FAILED");
  console.error(message);
  process.exit(1);
}


function runNodeScript(
  scriptPath,
  label
) {
  console.log("");
  console.log(label);

  const result =
    spawnSync(
      process.execPath,
      [scriptPath],
      {
        cwd:
          backendRoot,

        stdio:
          "inherit"
      }
    );

  if (
    result.status !== 0
  ) {
    fail(
      `${label} failed.`
    );
  }
}


if (
  !fs.existsSync(
    frontendRoot
  )
) {
  fail(
    `Frontend repository not found: ${frontendRoot}`
  );
}


if (
  !fs.existsSync(
    frontendDataDirectory
  )
) {
  fail(
    `Frontend _data directory not found: ${frontendDataDirectory}`
  );
}


runNodeScript(
  "./tools/test-catalog.js",
  "1. VALIDATING BACKEND CATALOG"
);


runNodeScript(
  "./tools/export-storefront-catalog.js",
  "2. EXPORTING STOREFRONT CATALOG"
);


if (
  !fs.existsSync(
    generatedCatalog
  )
) {
  fail(
    `Generated catalog not found: ${generatedCatalog}`
  );
}


console.log("");
console.log(
  "3. COPYING CATALOG TO FRONTEND"
);

fs.copyFileSync(
  generatedCatalog,
  frontendCatalog
);


if (
  !fs.existsSync(
    frontendCatalog
  )
) {
  fail(
    `Frontend catalog was not created: ${frontendCatalog}`
  );
}


const generatedContents =
  fs.readFileSync(
    generatedCatalog,
    "utf8"
  );

const frontendContents =
  fs.readFileSync(
    frontendCatalog,
    "utf8"
  );


if (
  generatedContents !==
  frontendContents
) {
  fail(
    "Frontend catalog does not match generated backend catalog."
  );
}


let parsedCatalog;

try {
  parsedCatalog =
    JSON.parse(
      frontendContents
    );
} catch (error) {
  fail(
    `Frontend catalog is not valid JSON: ${error.message}`
  );
}


const productCount =
  Object.keys(
    parsedCatalog
  ).length;


if (
  productCount < 1
) {
  fail(
    "Frontend catalog contains no products."
  );
}


console.log("");
console.log(
  "4. VERIFYING FRONTEND CATALOG"
);

console.log(
  `PRODUCT COUNT: ${productCount}`
);

console.log(
  `SOURCE: ${generatedCatalog}`
);

console.log(
  `DESTINATION: ${frontendCatalog}`
);

console.log("");
console.log(
  "CATALOG SYNC PASSED"
);