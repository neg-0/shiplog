'use client';

import { useState } from 'react';

const examples = [
  { audience: 'Customers', title: 'Your reports, ready to share', body: 'Export a report as a PDF and send it to anyone, even if they do not have an account. Large CSV exports also finish more reliably.' },
  { audience: 'Developers', title: 'PDF export and a CSV fix', body: 'Added PDF export for reports. Fixed a timeout affecting CSV exports above 10,000 rows. Existing export formats are unchanged.' },
  { audience: 'Stakeholders', title: 'Easier reporting outside the product', body: 'Teams can now share reports as PDFs. The release also resolves a timeout in large CSV exports. Planned scope and adoption metrics were not supplied.' },
];

export default function ReleaseExample() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected]!;

  return (
    <section id="example" aria-labelledby="example-heading" className="max-w-5xl mx-auto px-4 pb-20 scroll-mt-24">
      <div className="rounded-2xl border border-navy-200 bg-white shadow-lg overflow-hidden">
        <div className="border-b border-navy-100 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="example-heading" className="font-semibold text-navy-900">One release, three useful updates</h2>
          <span className="text-xs text-navy-500">Illustrative example · no sign-in needed</span>
        </div>
        <div className="grid md:grid-cols-2">
          <div className="bg-navy-950 text-navy-100 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-widest text-teal-400 mb-4">Your GitHub release · v1.8.0</p>
            <p className="font-mono text-sm leading-7">feat: add PDF report export<br />fix: CSV export timeout above 10k rows<br />No changes to existing export formats.</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-2 mb-6" aria-label="Example audience">
              {examples.map((item, index) => (
                <button key={item.audience} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${selected === index ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'}`}>
                  {item.audience}
                </button>
              ))}
            </div>
            <div aria-live="polite" className="min-h-36">
              <h3 className="text-xl font-semibold text-navy-900 mb-3">{example.title}</h3>
              <p className="text-navy-600 leading-7">{example.body}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
