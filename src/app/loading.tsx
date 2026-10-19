export default function Loading() {
  return (
    <div
      className="page-shell py-12"
      role="status"
      aria-label="Loading league content"
    >
      <span className="sr-only">Loading league content…</span>
      <div aria-hidden="true">
        <div className="skeleton h-4 w-32 mb-6" />
        <div className="skeleton h-12 w-3/4 max-w-lg mb-10" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="panel p-6">
              <div className="skeleton h-3 w-1/3 mb-6" />
              <div className="skeleton h-7 w-full mb-5" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
