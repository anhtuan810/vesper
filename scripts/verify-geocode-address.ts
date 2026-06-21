// Unit tests for the address normalisation that sits in front of the geocoder
// (pure, no network). A real property added via chat geocodes a free-text/model
// address string. Two regressions broke it: (1) the model re-appended the
// postcode when it re-stated the address — "Hafenstraße 16, 18356 Barth, 18356,
// Germany" — and the duplicate made Nominatim fail; (2) the European "PLZ City"
// form ("18356 Barth") was passed whole as the city, so the structured query
// never matched. cleanAddress() dedups the postcode; parseAddressParts() splits
// the postcode out of the city segment. Run: npx tsx scripts/verify-geocode-address.ts

import { cleanAddress, parseAddressParts, buildCanonicalAddress } from "../src/lib/geocode";

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

console.log("buildCanonicalAddress keeps the city so the string round-trips:");
{
  // The exact reported case: Empire State Building. The OLD canonical was
  // "5th Avenue 350, 10118, United States" (city dropped) and re-geocoding it at
  // commit read "10118" as the city and failed. The canonical must now carry the
  // city, and re-parsing it must recover a clean city + postcode.
  const ny = buildCanonicalAddress({
    lat: "40.748",
    lon: "-73.985",
    display_name: "350, 5th Avenue, New York, NY, 10118, United States",
    address: { road: "5th Avenue", house_number: "350", postcode: "10118", city: "New York", country: "United States" },
  });
  check("canonical includes the city", ny === "5th Avenue 350, 10118 New York, United States", JSON.stringify(ny));

  // Round-trip: feed the canonical back through the commit-time parser.
  const back = parseAddressParts(ny);
  check("round-trip recovers postcode", back.postcode === "10118", JSON.stringify(back));
  check("round-trip recovers city (not the postcode)", back.city === "New York", JSON.stringify(back));
  check("round-trip keeps the street", back.street === "5th Avenue 350", JSON.stringify(back));
  check("round-trip keeps the country", back.countryInAddress === "United States", JSON.stringify(back));

  // German round-trip (house number after street, "PLZ City" locality).
  const de = buildCanonicalAddress({
    lat: "54.36", lon: "12.72", display_name: "Hafenstraße, 16, Barth, 18356, Germany",
    address: { road: "Hafenstraße", house_number: "16", postcode: "18356", city: "Barth", country: "Germany" },
  });
  check("German canonical includes city", de === "Hafenstraße 16, 18356 Barth, Germany", JSON.stringify(de));
  const deBack = parseAddressParts(de);
  check("German round-trip city", deBack.city === "Barth" && deBack.postcode === "18356", JSON.stringify(deBack));

  // Defensive: a result with no city at all still produces a usable 2-part string.
  const noCity = buildCanonicalAddress({
    lat: "0", lon: "0", display_name: "fallback",
    address: { road: "Main St", house_number: "1", postcode: "12345", country: "Testland" },
  });
  check("no-city canonical still has postcode + country", noCity === "Main St 1, 12345, Testland", JSON.stringify(noCity));
}

console.log("parseAddressParts treats a bare-postcode city segment as a postcode:");
{
  // The lossy legacy canonical form — postcode where the city should be.
  const lossy = parseAddressParts("5th Avenue 350, 10118, United States");
  check("bare-postcode segment → postcode set", lossy.postcode === "10118", JSON.stringify(lossy));
  check("bare-postcode segment → city undefined (no town named '10118')", lossy.city === undefined, JSON.stringify(lossy));
  check("bare-postcode segment → street kept", lossy.street === "5th Avenue 350", JSON.stringify(lossy));
}

console.log(failures === 0 ? "\nAll geocode-address checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
