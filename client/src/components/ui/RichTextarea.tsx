import React, { useRef, useEffect, useCallback } from 'react';

interface RichTextareaProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#1a1a1a' },
  { label: 'Charcoal', value: '#4b5563' },
  { label: 'Forest', value: '#25426c' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Gold', value: '#b4860a' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef9c3' },
  { label: 'Blue', value: '#dbeafe' },
  { label: 'Green', value: '#d1fae5' },
  { label: 'Pink', value: '#fce7f3' },
  { label: 'Purple', value: '#ede9fe' },
  { label: 'Peach', value: '#ffedd5' },
];

export function RichTextarea({ value, onChange, placeholder, className = '', minHeight = '80px' }: RichTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtml = useRef(value);

  useEffect(() => {
    if (editorRef.current && value !== lastHtml.current) {
      editorRef.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  const exec = (command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    handleInput();
  };

  const setFontSize = (size: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      document.execCommand('fontSize', false, '7');
      const spans = editorRef.current?.querySelectorAll('[size="7"]');
      spans?.forEach(span => {
        (span as HTMLElement).removeAttribute('size');
        (span as HTMLElement).style.fontSize = size;
      });
    } else {
      const span = document.createElement('span');
      span.style.fontSize = size;
      try {
        range.surroundContents(span);
      } catch {
        document.execCommand('fontSize', false, '7');
        const spans = editorRef.current?.querySelectorAll('[size="7"]');
        spans?.forEach(s => {
          (s as HTMLElement).removeAttribute('size');
          (s as HTMLElement).style.fontSize = size;
        });
      }
    }
    handleInput();
  };

  const ToolBtn = ({ onClick, title, children, active }: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-1.5 py-0.5 font-dm text-xs border rounded-none transition-colors ${active ? 'bg-ink text-white border-ink' : 'bg-white text-ink/60 border-transparent hover:border-gold/40 hover:text-ink'}`}
    >
      {children}
    </button>
  );

  return (
    <div className={`border border-gold/30 bg-white rounded-none ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gold/20 bg-linen/40 flex-wrap">
        <ToolBtn onClick={() => exec('bold')} title="Bold"><span className="font-bold">B</span></ToolBtn>
        <ToolBtn onClick={() => exec('italic')} title="Italic"><span className="italic">I</span></ToolBtn>
        <ToolBtn onClick={() => exec('underline')} title="Underline"><span className="underline">U</span></ToolBtn>
        <div className="w-px h-4 bg-gold/30 mx-1 self-center" />
        <select
          onMouseDown={e => e.stopPropagation()}
          onChange={e => setFontSize(e.target.value)}
          defaultValue=""
          className="text-[10px] border border-gold/30 px-1 py-0.5 bg-white font-dm text-ink/60 cursor-pointer focus:outline-none rounded-none"
          title="Font size"
        >
          <option value="" disabled>Size</option>
          <option value="11px">Small</option>
          <option value="14px">Normal</option>
          <option value="17px">Large</option>
          <option value="21px">X-Large</option>
        </select>
        <div className="w-px h-4 bg-gold/30 mx-1 self-center" />
        <span className="font-bebas tracking-widest text-[9px] text-ink/30 mr-0.5">COLOR</span>
        {TEXT_COLORS.filter(c => c.value).map(({ label, value: color }) => (
          <button
            key={label}
            type="button"
            onMouseDown={e => { e.preventDefault(); exec('foreColor', color); }}
            title={`Text: ${label}`}
            className="w-4 h-4 border border-gold/30 hover:scale-125 transition-transform rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        ))}
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); exec('removeFormat'); }}
          title="Remove text color"
          className="w-4 h-4 border border-gold/30 hover:scale-125 transition-transform flex items-center justify-center text-[8px] text-ink/40 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, white 45%, #e5e7eb 55%)' }}
        >✕</button>
        <div className="w-px h-4 bg-gold/30 mx-1 self-center" />
        <span className="font-bebas tracking-widest text-[9px] text-ink/30 mr-0.5">HL</span>
        {HIGHLIGHT_COLORS.map(({ label, value: color }) => (
          <button
            key={label}
            type="button"
            onMouseDown={e => { e.preventDefault(); exec('hiliteColor', color); }}
            title={`Highlight: ${label}`}
            className="w-4 h-4 border border-gold/30 hover:scale-125 transition-transform rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        ))}
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); exec('hiliteColor', 'transparent'); }}
          title="Remove highlight"
          className="w-4 h-4 border border-gold/30 hover:scale-125 transition-transform flex items-center justify-center text-[8px] text-ink/40 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, white 45%, #e5e7eb 55%)' }}
        >✕</button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="px-3 py-2.5 font-dm text-sm text-ink focus:outline-none vf-rich-editor"
        style={{ minHeight }}
      />
    </div>
  );
}
