export default function ModulePlaceholder({
  title,
  description,
}) {
  return (
    <section>
      <h1>{title}</h1>

      <p>{description}</p>

      <div
        style={{
          marginTop: '24px',
          padding: '24px',
          borderRadius: '14px',
          background: '#ffffff',
          border: '1px solid #dbe3ef',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <strong>{title} module</strong>

        <p style={{ marginBottom: 0 }}>
          This section is connected and ready for its full feature build.
        </p>
      </div>
    </section>
  )
}