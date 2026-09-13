"use client";

export default function PrintButton({
  label = "Download / Print",
  className = "btn btn-primary btn-sm",
  docTitle,
}: {
  label?: string;
  className?: string;
  docTitle?: string;
}) {
  function handlePrint() {
    // When a docTitle is supplied, the browser uses it as the suggested PDF
    // filename (and the running-head title) for the duration of the print, then
    // we restore the previous tab title afterwards.
    if (docTitle) {
      const prev = document.title;
      document.title = docTitle;
      window.addEventListener("afterprint", () => { document.title = prev; }, { once: true });
    }
    window.print();
  }

  return (
    <button type="button" className={className + " no-print"} onClick={handlePrint}>
      <i className="fa-solid fa-download" /> {label}
    </button>
  );
}
