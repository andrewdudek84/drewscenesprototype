import { useState } from 'react';
import AssetsPalette from './AssetsPalette';
import ShapesPalette from './ShapesPalette';

type Tab = 'shapes' | 'assets';

export default function BottomPanel() {
  const [tab, setTab] = useState<Tab>('shapes');

  return (
    <section className="panel palette">
      <header className="panel-header bottom-tabs">
        <button
          type="button"
          className={`tab-btn${tab === 'shapes' ? ' is-active' : ''}`}
          onClick={() => setTab('shapes')}
        >
          Shapes
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'assets' ? ' is-active' : ''}`}
          onClick={() => setTab('assets')}
        >
          Assets
        </button>
      </header>
      {tab === 'shapes' ? <ShapesPalette /> : <AssetsPalette />}
    </section>
  );
}
