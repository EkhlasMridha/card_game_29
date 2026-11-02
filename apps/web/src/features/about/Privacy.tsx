import { Screen } from '../../components/Screen';
import { useStore } from '../../state/hooks';

export function Privacy({ onBack }: { onBack: () => void }) {
  const info = useStore((s) => s.serverInfo);
  return (
    <Screen title="Privacy & About" onBack={onBack}>
      <div className="flex flex-col gap-4">
        <section className="panel p-5 text-sm leading-relaxed text-white/80">
          <h2 className="mb-2 font-display text-2xl text-gold-300">Your games stay on your network</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The whole game runs from one computer on your Wi-Fi (the host). Nothing is sent to the internet.</li>
            <li>There are no accounts, analytics, ads, telemetry, crash reporting or cloud servers.</li>
            <li>All scripts, fonts, card art and sounds are bundled with the app or generated in your browser. The page's security policy blocks any other origin.</li>
            <li>QR codes are generated locally.</li>
            <li>The host keeps game state in memory only. Closing the host ends the game, and nothing is written to disk.</li>
            <li>Your display name and preferences are stored only in this browser. A reconnection token for your seat is kept here until you leave the room.</li>
          </ul>
        </section>
        <section className="panel p-5 text-sm leading-relaxed text-white/80">
          <h2 className="mb-2 font-display text-2xl text-gold-300">Fair play</h2>
          <p>
            The host is the referee. It shuffles with the operating system's cryptographic random generator, validates every bid and card, and sends each player only
            what they may see. Your browser never receives other players' hands or the hidden trump suit before it is revealed.
          </p>
          <p className="mt-2 text-white/60">
            Being on a local network does not make it fully private: anyone who controls the host computer can inspect its memory. Play with people you trust on a
            network you trust.
          </p>
        </section>
        <section className="panel p-5 text-sm leading-relaxed text-white/80">
          <h2 className="mb-2 font-display text-2xl text-gold-300">Network tips</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>All devices must be on the same Wi-Fi. The router does not need internet access.</li>
            <li>Guest networks, “AP/client isolation” and some phone hotspots stop devices from reaching each other. Use a normal home network if joining fails.</li>
            <li>Allow the host's Node.js through its firewall for private networks (the port is {info?.port ?? 5050}).</li>
            <li>If the host restarts, current games are lost. Create a new room.</li>
          </ul>
        </section>
        <p className="text-center text-xs text-white/40">
          Twenty-Nine LAN · version {info?.appVersion ?? '1.0.0'} · protocol v{info?.protocol ?? 1}
        </p>
      </div>
    </Screen>
  );
}
