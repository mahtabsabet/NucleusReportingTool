// Spiral notebook binding: two thin horizontal strips drawn with
// CSS background-images. Each strip tiles a single inline SVG so
// the rings keep their natural aspect ratio regardless of the
// notebook's width (the previous SVG-stretch approach made the
// rings look squished on wide screens).

export function NotebookSpiral() {
  return (
    <div className="relative w-full" aria-hidden>
      <div className="notebook-rings" />
      <div className="notebook-perforations" />
    </div>
  );
}
