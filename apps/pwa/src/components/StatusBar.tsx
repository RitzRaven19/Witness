interface Props {
  online: boolean;
  queueCount: number;
}

export function StatusBar({ online, queueCount }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d0d] border-b border-border text-xs select-none">
      <div className="flex items-center gap-1.5 font-semibold tracking-widest text-white uppercase">
        <span className="inline-block w-2 h-2 rounded-full bg-white" />
        Witness
      </div>
      <div className="flex items-center gap-3 text-zinc-400">
        {queueCount > 0 && (
          <span className="text-amber-400 font-medium">
            Q:{queueCount}
          </span>
        )}
        <span className={online ? 'text-green-400' : 'text-zinc-600'}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>
  );
}
