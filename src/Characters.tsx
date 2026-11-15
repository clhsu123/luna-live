import { useState } from 'react';
import './characters.css';
export const characters = [
  {id:'luna-office', face:'Luna', name:'黑白 OL', detail:'黑西裝 · 白色 V 領襯衫'},
  {id:'luna-evening', face:'Luna', name:'象牙白晚裝', detail:'露肩緞面禮服'},
  {id:'08-office', face:'08', name:'俐落套裝', detail:'炭灰背心 · 長褲'},
  {id:'08-evening', face:'08', name:'黑色晚裝', detail:'露肩 · 心形領'},
  {id:'19-office', face:'19', name:'香檳 OL', detail:'緞面襯衫 · 黑色窄裙'},
  {id:'19-evening', face:'19', name:'墨綠晚裝', detail:'細肩帶 · 緞面'},
  {id:'20-knit', face:'20', name:'柔和針織', detail:'露肩針織 · 奶茶窄裙'},
  {id:'20-evening', face:'20', name:'酒紅晚裝', detail:'細肩帶 · 垂墜領'}
];
export function portraitUrl(id: string) { return `/characters/${id}.webp`; }
export function useCharacter() {
  const [id, setId] = useState(() => { try { const saved = localStorage.getItem('luna.appearance.v1'); return characters.some(c => c.id === saved) ? saved! : characters[0].id; } catch { return characters[0].id; } });
  function select(value: string) { if (!characters.some(c => c.id === value)) return; setId(value); try { localStorage.setItem('luna.appearance.v1', value); } catch { /* appearance still works this session */ } }
  return [characters.find(c => c.id === id)!, select] as const;
}
export function CharacterPicker({selected, onSelect}: {selected:string; onSelect:(id:string)=>void}) {
  const [open, setOpen] = useState(false);
  return <section className="character-picker" aria-label="角色與造型">
    <button className="character-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>角色與造型 · 4 張臉模 / 8 款造型 <span>{open ? '收起 −' : '更換 ＋'}</span></button>
    {open && <div className="character-grid">{characters.map(c => <button key={c.id} className={selected === c.id ? 'selected' : ''} aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>
      <img src={portraitUrl(c.id)} alt={`${c.face} · ${c.name}`} loading="lazy"/><strong>{c.face} · {c.name}</strong><small>{c.detail}</small>
    </button>)}</div>}
    <p>所有外觀共用同一份 Luna 記憶。換裝不會重開語音連線。</p>
  </section>;
}
