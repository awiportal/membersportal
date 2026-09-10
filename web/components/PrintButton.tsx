"use client";

export default function PrintButton({
  label = "Download / Print",
  className = "btn btn-primary btn-sm",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" className={className + " no-print"} onClick={() => window.print()}>
      <i className="fa-solid fa-download" /> {label}
    </button>
  );
}
