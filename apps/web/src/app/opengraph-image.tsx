import { ImageResponse } from 'next/og';

export const alt = 'ShipLog — one release, three audiences';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', background: '#0c1929', color: '#fff', padding: '80px', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 32, color: '#6ee7b7', marginBottom: 40 }}>ShipLog</div>
      <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>Release notes that</div>
      <div style={{ fontSize: 72, fontWeight: 700, color: '#6ee7b7', marginBottom: 40 }}>ship themselves.</div>
      <div style={{ fontSize: 30, color: '#cbd5e1' }}>One release. Customers, developers, stakeholders.</div>
    </div>,
    size,
  );
}
