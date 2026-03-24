import React, { useState } from 'react';

// Decoy calculator shown after purge. Looks like a stock iOS calculator.
// Typing the user's 4-digit PIN unlocks the real app silently.

interface Props {
  pin: string;
  onUnlock: () => void;
}

export function DecoyScreen({ pin, onUnlock }: Props) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState('');
  const [fresh, setFresh] = useState(true);

  function checkPin(value: string) {
    if (value === pin) {
      setTimeout(onUnlock, 120); // brief delay so last digit renders first
    }
  }

  function pressDigit(d: string) {
    let next: string;
    if (fresh) {
      next = d;
      setFresh(false);
    } else {
      next = display === '0' ? d : display.length < 12 ? display + d : display;
    }
    setDisplay(next);
    checkPin(next);
  }

  function pressDot() {
    setFresh(false);
    setDisplay(d => d.includes('.') ? d : d + '.');
  }

  function pressOp(o: string) {
    setPrev(display);
    setOp(o);
    setFresh(true);
  }

  function pressEqual() {
    if (!op || !prev) return;
    const a = parseFloat(prev);
    const b = parseFloat(display);
    let result = 0;
    if (op === '+') result = a + b;
    else if (op === '-') result = a - b;
    else if (op === '×') result = a * b;
    else if (op === '÷') result = b !== 0 ? a / b : 0;
    const str = parseFloat(result.toPrecision(10)).toString();
    setDisplay(str.length > 12 ? parseFloat(result.toFixed(6)).toString() : str);
    setPrev('');
    setOp('');
    setFresh(true);
  }

  function pressClear() {
    setDisplay('0');
    setPrev('');
    setOp('');
    setFresh(true);
  }

  function pressPlusMinus() {
    setDisplay(d => d.startsWith('-') ? d.slice(1) : d === '0' ? '0' : '-' + d);
  }

  function pressPercent() {
    setDisplay(d => String(parseFloat(d) / 100));
  }

  const btn = (label: string, onClick: () => void, variant: 'dark' | 'mid' | 'orange' = 'dark') => {
    const bg =
      variant === 'orange' ? 'bg-[#ff9f0a] active:bg-[#ffb340] text-white' :
      variant === 'mid'    ? 'bg-[#636366] active:bg-[#7c7c80] text-white' :
                             'bg-[#1c1c1e] active:bg-[#2c2c2e] text-white';
    return (
      <button
        onClick={onClick}
        className={`${bg} rounded-full w-full aspect-square flex items-center justify-center text-[28px] font-light select-none transition-colors`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-dvh bg-black text-white select-none">
      {/* Status bar space */}
      <div className="h-12 shrink-0"/>

      {/* Display */}
      <div className="flex-1 flex flex-col justify-end px-6 pb-4">
        <div className="text-right font-thin leading-none tracking-tight overflow-hidden">
          <span className={
            display.length > 9 ? 'text-[44px]' :
            display.length > 7 ? 'text-[56px]' : 'text-[72px]'
          }>
            {display}
          </span>
        </div>
      </div>

      {/* Keypad */}
      <div className="px-4 pb-10 grid grid-cols-4 gap-3 shrink-0">
        {btn('AC',  pressClear,      'mid')}
        {btn('+/-', pressPlusMinus,  'mid')}
        {btn('%',   pressPercent,    'mid')}
        {btn('÷',   () => pressOp('÷'), 'orange')}

        {btn('7', () => pressDigit('7'))}
        {btn('8', () => pressDigit('8'))}
        {btn('9', () => pressDigit('9'))}
        {btn('×', () => pressOp('×'), 'orange')}

        {btn('4', () => pressDigit('4'))}
        {btn('5', () => pressDigit('5'))}
        {btn('6', () => pressDigit('6'))}
        {btn('-', () => pressOp('-'), 'orange')}

        {btn('1', () => pressDigit('1'))}
        {btn('2', () => pressDigit('2'))}
        {btn('3', () => pressDigit('3'))}
        {btn('+', () => pressOp('+'), 'orange')}

        {/* Zero — spans 2 columns */}
        <button
          onClick={() => pressDigit('0')}
          className="bg-[#1c1c1e] active:bg-[#2c2c2e] rounded-full col-span-2 px-8 py-5 text-[28px] font-light text-left flex items-center select-none transition-colors"
        >
          0
        </button>
        {btn('.', pressDot)}
        {btn('=', pressEqual, 'orange')}
      </div>
    </div>
  );
}
