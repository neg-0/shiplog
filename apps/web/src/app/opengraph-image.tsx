import { ImageResponse } from 'next/og';

export const alt = 'ShipLog — You ship code. We get the word out.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#f6f3e9', color: '#233d40', padding: '62px 72px', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 27, paddingBottom: 28, borderBottom: '1px solid #cbd0be' }}><span>ShipLog</span><span style={{ fontSize: 16, color: '#69786e' }}>A PROPER SEND-OFF FOR YOUR RELEASES.</span></div>
      <div style={{ display: 'flex', fontFamily: 'serif', fontSize: 88, letterSpacing: -4, lineHeight: 1.07, flexDirection: 'column', marginTop: 51 }}><span>You ship code.</span><span style={{ color: '#b64b2d', fontStyle: 'italic' }}>We get the word out.</span></div>
      <div style={{ display: 'flex', fontFamily: 'sans-serif', fontSize: 22, marginTop: 41, color: '#69786e' }}>GitHub releases / three tailored drafts / your people.</div>
      <div style={{ display: 'flex', fontFamily: 'sans-serif', fontSize: 16, marginTop: 23, gap: 32 }}><span>SLACK</span><span>DISCORD</span><span>HOSTED CHANGELOG</span></div>
    </div>, size,
  );
}
