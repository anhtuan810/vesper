// Unit tests for the address normalisation that sits in front of the geocoder
// (pure, no network). A real property added via chat geocodes a free-text/model
// address string. Two regressions broke it: (1) the model re-appended the
// postcode when it re-stated the address — "Hafenstraße 16, 18356 Barth, 18356,
// Germany" — and the duplicate made Nominatim fail; (2) the European "PLZ City"
// form ("18356 Barth") was passed whole as the city, so the structured query
// never matched. cleanAddress() dedups the postcode; parseAddressParts() splits
// the postcode out of the city segment. Run: npx tsx scripts/verify-geocode-address.ts

import { cleanAddress, parseAddressParts } from "../src/lib/geocode";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("cleanAddress dedups a re-appended / standalone postcode:");
{
  // The exact failing case from the screenshot.
  const got = cleanAddress("Hafenstraße 16, 18356 Barth, 18356, Germany");
  check("German duplicate postcode dropped", got === "Hafenstraße 16, 18356 Barth, Germany", JSON.stringify(got));

  // Dutch "1234 AB" form, duplicated.
  const nl = cleanAddress("Stationsplein 1, 5611 AB Eindhoven, 5611 AB, Netherlands");
  check("Dutch duplicate postcode dropped", nl === "Stationsplein 1, 5611 AB Eindhoven, Netherlands", JSON.stringify(nl));

  // No duplicate → unchanged (and trims whitespace around segments).
  const clean = cleanAddress("Hafenstraße 16,  18356 Barth,  Germany");
  check("clean address unchanged (trimmed)", clean === "Hafenstraße 16, 18356 Barth, Germany", JSON.stringify(clean));

  // Exact duplicate segment collapsed.
  const dupCity = cleanAddress("Main St 1, Berlin, Berlin, Germany");
  check("exact duplicate segment collapsed", dupCity === "Main St 1, Berlin, Germany", JSON.stringify(dupCity));

  // A standalone postcode that is NOT already present stays (we must not drop real data).
  const standalone = cleanAddress("Hafenstraße 16, Barth, 18356, Germany");
  check("standalone postcode kept when not duplicated", standalone === "Hafenstraße 16, Barth, 18356, Germany", JSON.stringify(standalone));
}

console.log("parseAddressParts splits postcode out of the city segment:");
{
  // German "PLZ City" (leading postcode).
  const de = parseAddressParts("Hafenstraße 16, 18356 Barth, Germany");
  check("DE street", de.street === "Hafenstraße 16", JSON.stringify(de));
  check("DE city (postcode removed)", de.city === "Barth", JSON.stringify(de));
  check("DE postcode extracted", de.postcode === "18356", JSON.stringify(de));
  check("DE country", de.countryInAddress === "Germany", JSON.stringify(de));

  // Dutch "PLZ City" with the "1234 AB" form.
  const nl = parseAddressParts("Stationsplein 1, 5611 AB Eindhoven, Netherlands");
  check("NL city (postcode removed)", nl.city === "Eindhoven", JSON.stringify(nl));
  check("NL postcode extracted", nl.postcode === "5611 AB", JSON.stringify(nl));

  // Trailing postcode form ("City PLZ").
  const trailing = parseAddressParts("Hafenstraße 16, Barth 18356, Germany");
  check("trailing city", trailing.city === "Barth", JSON.stringify(trailing));
  check("trailing postcode extracted", trailing.postcode === "18356", JSON.stringify(trailing));

  // No postcode in the city segment → city kept whole, postcode undefined.
  const plain = parseAddressParts("Hafenstraße 16, Barth, Germany");
  check("plain city kept", plain.city === "Barth", JSON.stringify(plain));
  check("plain postcode undefined", plain.postcode === undefined, JSON.stringify(plain));

  // Fewer than 2 segments → empty object (nothing to parse structurally).
  const oneSeg = parseAddressParts("Barth");
  check("single segment → empty", Object.keys(oneSeg).length === 0, JSON.stringify(oneSeg));
}

console.log(failures === 0 ? "\nAll geocode-address checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
