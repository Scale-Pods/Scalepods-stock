"use client";

import { useSearchParams } from "next/navigation";
import { ParamSelect } from "./FilterBar";

const COMPANIES = [{ value: "NPF", label: "Northwind Pipes & Fittings (NPF)" }, { value: "BSE", label: "Bluecrest Steel & Engineering (BSE)" }];

/** Which of the two Tally companies the Tally pages show. The choice lives in the address (entity) and follows you from tab to tab; Northwind is the default. */
export function TallyCompany() {
  const sp = useSearchParams();
  return (
    <div className="mb-4">
      <ParamSelect name="entity" label="Company" value={sp.get("entity") === "BSE" ? "BSE" : "NPF"} options={COMPANIES} />
    </div>
  );
}
