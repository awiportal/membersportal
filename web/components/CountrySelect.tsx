"use client";

import { useMemo } from "react";
import FancySelect from "./FancySelect";
import { COUNTRIES } from "@/lib/countries";

// Searchable country picker built on FancySelect. Two value modes:
//   valueBy="name" (default) -> option value is the country name (onboarding)
//   valueBy="code"           -> option value is the ISO alpha-2 code (profile)
export default function CountrySelect({
  value,
  onChange,
  name,
  valueBy = "name",
  placeholder = "Select a country...",
  ariaLabel = "Country",
}: {
  value: string;
  onChange: (v: string) => void;
  name?: string;
  valueBy?: "name" | "code";
  placeholder?: string;
  ariaLabel?: string;
}) {
  const options = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        value: valueBy === "code" ? c.code : c.name,
        label: c.flag + "  " + c.name,
        keywords: c.name + " " + c.code + " " + c.dial,
      })),
    [valueBy]
  );
  return (
    <FancySelect
      options={options}
      value={value}
      onChange={onChange}
      name={name}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      searchable={true}
      searchPlaceholder="Search countries..."
    />
  );
}
