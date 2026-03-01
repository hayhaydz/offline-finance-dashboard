<script lang="ts">
  // import { formatCurrencyShorthand } from '$lib/utils/currency';

  // Helper for portability
  const formatCurrencyShorthand = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 }).format(n);

  let { progress = 50, goalName = 'Emergency Fund', current = 2000, target = 4000 } = $props();

  // ==========================================
  // LOGIC
  // ==========================================

  let p = $derived(Math.min(100, Math.max(0, progress)));

  const progressColor = $derived(
    p >= 100 ? 'green' : p >= 70 ? 'green' : p >= 30 ? 'amber' : 'red'
  );

  const colors = $derived({
    green: { text: 'text-green-700', bg: 'bg-green-700', border: 'border-green-700' },
    amber: { text: 'text-amber-600', bg: 'bg-amber-600', border: 'border-amber-600' },
    red:   { text: 'text-red-600',   bg: 'bg-red-600',   border: 'border-red-600'   }
  }[progressColor]);

  // --- LEGACY TEXT LOGIC (V1-V6) ---
  const bar1Color = $derived(
    progressColor === 'green' ? '#2e7d32' : progressColor === 'amber' ? '#f57c00' : '#d32f2f'
  );

  const bar2 = $derived.by(() => {
    const filled = Math.floor(p / 5);
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 20 - filled));
  });

  const bar3 = $derived.by(() => {
    const dense = Math.floor(p / 10);
    return '▓'.repeat(Math.max(0, dense)) + '░'.repeat(Math.max(0, 10 - dense));
  });

  const bar4Display = $derived.by(() => {
    const boxWidth = 30;
    const fillWidth = Math.floor((p / 100) * boxWidth);
    return '█'.repeat(fillWidth) + '·'.repeat(boxWidth - fillWidth);
  });

  const segmentChars = $derived.by(() => {
    const fill = Math.floor(p / 10);
    return Array.from({ length: 10 }, (_, i) => i < fill ? '━' : '─').join('');
  });

  const v6Filled = $derived.by(() => '▓'.repeat(Math.floor(p / 4)));
  const v6Empty = $derived.by(() => '░'.repeat(25 - Math.floor(p / 4)));
</script>

<div class="max-w-3xl mx-auto font-mono text-xs uppercase relative pb-32 overflow-hidden">

  <div class="sticky top-0 z-50 bg-gray-50 border-b-2 border-black p-4 shadow-xl mb-8">
    <div class="flex justify-between items-end mb-2">
      <div>
        <h1 class="font-bold text-sm">FINANCIAL_GOAL: {goalName}</h1>
        <div class="text-xs text-gray-500">TARGET: {formatCurrencyShorthand(target)}</div>
      </div>
      <div class="text-right">
        <div class="font-bold {colors.text}">STATUS: {progressColor.toUpperCase()}</div>
        <div>{p}% FUNDED</div>
      </div>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      bind:value={progress}
      class="w-full h-2 bg-gray-300 appearance-none cursor-pointer rounded-none block"
      style="accent-color: black"
    />
  </div>

  <div class="space-y-8 px-4">

    <div class="border-b-2 border-black pb-2 mb-6 mt-4">
      <h2 class="font-bold text-lg text-gray-400">CLASS 1 :: ASCII_TEXT</h2>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V1: Solid Fill</div>
      <div class="flex items-center gap-2">
        <div class="flex-1 h-4 border border-black relative">
          <div class="h-full transition-all duration-100" style="width: {p}%; background-color: {bar1Color};"></div>
        </div>
        <span class="text-xs text-gray-500 min-w-8 text-right">{p}%</span>
      </div>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V2: Block Standard</div>
      <div class="flex items-center gap-2 font-terminal overflow-hidden whitespace-nowrap">
        <span class="text-gray-600">[</span>
        <span class={colors.text}>{bar2}</span>
        <span class="text-gray-600">]</span>
      </div>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V3: Shade Gradient</div>
      <div class="flex items-center gap-2 font-terminal overflow-hidden whitespace-nowrap">
        <span class="text-gray-600">[</span>
        <span class={colors.text}>{bar3}</span>
        <span class="text-gray-600">]</span>
      </div>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V4: Dot Matrix</div>
      <div class="flex items-center gap-2 font-terminal overflow-hidden whitespace-nowrap">
        <span class="text-gray-600">[</span>
        <span class={colors.text}>{bar4Display}</span>
        <span class="text-gray-600">]</span>
      </div>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V5: Segment Line</div>
      <div class="flex items-center gap-2 font-terminal overflow-hidden whitespace-nowrap">
        <span class="text-gray-600">|</span>
        <span class={colors.text}>{segmentChars}</span>
        <span class="text-gray-600">|</span>
      </div>
    </div>

    <div class="border border-black p-3 bg-white">
      <div class="font-bold text-sm mb-2">V6: Density Map</div>
      <div class="flex items-center gap-2 font-terminal overflow-hidden whitespace-nowrap">
        <span class="text-gray-600">STS:</span>
        <span class="{colors.text} font-bold">{v6Filled}</span>
        <span class="text-gray-400">{v6Empty}</span>
      </div>
    </div>


    <div class="border-b-2 border-black pb-2 mb-6 mt-12">
      <h2 class="font-bold text-lg text-gray-400">CLASS 2 :: STRUCTURAL_CSS</h2>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>07 :: BLOCK_STANDARD (CSS)</span>
      </div>
      
      <div class="flex items-center gap-1 text-base leading-none font-bold w-full text-gray-600">
        <span>[</span>
        
        <div class="flex-1 h-[1.1em] relative bg-transparent">
          
          <div class="absolute inset-0 pattern-stipple {colors.text} opacity-50"></div>
          
          <div 
            class="h-full pattern-solid-blocks {colors.text} opacity-90 transition-all duration-300 border-r border-white/50" 
            style="width: {p}%"
          ></div>
          
        </div>
        
        <span>]</span>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>08 :: STATIC_NOISE</span>
        <span>BUFFERING...</span>
      </div>
      <div class="h-8 border border-black relative bg-white">
        <div class="h-full pattern-hash {colors.text} transition-all duration-300 border-r border-black" style="width: {p}%"></div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>09 :: CALIBRATOR</span>
        <span>{p.toFixed(1)} UNIT</span>
      </div>
      <div class="h-10 border-b-2 border-black relative">
        <div class="absolute bottom-0 h-5 {colors.bg} transition-all duration-300 opacity-90" style="width: {p}%"></div>
        <div class="absolute inset-0 pattern-ruler opacity-100"></div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>10 :: ALLOCATION_CELLS</span>
        <span>{Math.floor(p/5)}/20</span>
      </div>
      <div class="h-8 w-full relative bg-gray-100 border border-black">
        <div class="absolute inset-0 pattern-grid z-10"></div>
        <div class="h-full {colors.bg} transition-all duration-300" style="width: {p}%"></div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>11 :: ASSET_CONTAINER</span>
        <span>SECURE</span>
      </div>
      <div class="flex items-center gap-2 text-2xl leading-none font-bold {colors.text}">
        <span>[</span>
        <div class="flex-1 h-6 relative mt-1 border-y border-gray-100">
          <div class="absolute inset-0 flex justify-between opacity-20">
            {#each Array(40) as _} <div class="w-px h-full bg-current"></div> {/each}
          </div>
          <div class="h-full {colors.bg} transition-all duration-300 mix-blend-multiply" style="width: {p}%"></div>
        </div>
        <span>]</span>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>12 :: HASH_RATE</span>
        <span>SYNCING</span>
      </div>
      <div class="h-6 border border-black relative overflow-hidden bg-white">
        <div class="h-full {colors.bg} transition-all duration-300 relative border-r border-black" style="width: {p}%">
           <div class="absolute inset-0 pattern-diagonal opacity-50"></div>
        </div>
      </div>
    </div>

    <div class="border-b-2 border-black pb-2 mb-6 mt-12">
      <h2 class="font-bold text-lg text-gray-400">CLASS 3 :: FINANCIAL_TAPE</h2>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>13 :: CASH_STACK</span>
        <span>{p >= 100 ? 'MAX_CAP' : 'ACCUMULATING'}</span>
      </div>
      <div class="h-8 border-x border-black bg-gray-50 relative">
        <div class="absolute inset-0 pattern-stack opacity-20"></div>
        <div class="h-full overflow-hidden transition-all duration-300 relative" style="width: {p}%">
          <div class="h-full w-screen pattern-stack {colors.text}"></div>
        </div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>14 :: LEDGER_TAPE</span>
        <span>AUDIT_OK</span>
      </div>
      <div class="h-4 w-full flex items-center">
        <div class="w-full h-0.5 bg-gray-300 absolute"></div>
        <div class="h-1 {colors.bg} relative transition-all duration-300" style="width: {p}%">
           <div class="absolute right-0 top-[-6px] h-4 w-2 bg-black"></div>
        </div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>15 :: ASSET_ID</span>
        <span>|| ||| ||</span>
      </div>
      <div class="h-10 border border-black bg-white p-0.5">
        <div class="h-full overflow-hidden transition-all duration-300 border-r-2 border-black" style="width: {p}%">
          <div class="h-full w-screen pattern-barcode {colors.bg}"></div>
        </div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>16 :: YIELD_TRACK</span>
        <span>{formatCurrencyShorthand(current)}</span>
      </div>
      <div class="h-6 border-y-2 border-black relative py-0.5">
        <div class="h-full {colors.bg} transition-all duration-300 opacity-80" style="width: {p}%"></div>
        <div class="absolute inset-0 pattern-ticks opacity-30"></div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>17 :: DEPOSIT_CHUNKS</span>
        <span>x{Math.floor(p/10)}</span>
      </div>
      <div class="h-8 w-full bg-gray-100 border border-black relative">
        <div class="absolute inset-0 pattern-chunks z-10"></div>
        <div class="h-full {colors.bg} transition-all duration-300" style="width: {p}%"></div>
      </div>
    </div>

    <div class="w-full">
      <div class="flex justify-between mb-1 font-bold {colors.text}">
        <span>18 :: FISCAL_TIMELINE</span>
        <span>Q{Math.ceil(p/25)}</span>
      </div>
      <div class="h-8 relative flex items-center">
        <div class="w-full h-px bg-black"></div>
        <div class="absolute left-0 h-2 {colors.bg} transition-all duration-300" style="width: {p}%"></div>
        <div class="absolute inset-0 pattern-wide-ruler opacity-50"></div>
      </div>
    </div>

  </div>
</div>

<style>
  .font-terminal {
    font-family: 'Courier New', Courier, monospace;
  }

  /* --- PATTERNS --- */

  /* V7: CSS REPLICA PATTERNS */
  /* This creates the "Empty" dotted texture (░) */
  .pattern-stipple {
    background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
    background-size: 3px 3px;
  }
  /* This creates the "Filled" blocks (█) with white gaps */
  /* 10px solid color, 1px white gap - reduced gap size */
  .pattern-solid-blocks {
    background-image: repeating-linear-gradient(
      90deg,
      currentColor,
      currentColor 12px,
      transparent 12px,
      transparent 13px
    );
  }

  /* OTHER VARIANT PATTERNS */
  .pattern-hash {
    background-image: radial-gradient(currentColor 15%, transparent 16%), radial-gradient(currentColor 15%, transparent 16%);
    background-size: 4px 4px;
    background-position: 0 0, 2px 2px;
  }
  .pattern-ruler {
    background-image: repeating-linear-gradient(90deg, black, black 1px, transparent 1px, transparent 10px);
    background-size: 100% 50%;
    background-repeat: no-repeat;
    background-position: bottom;
  }
  .pattern-grid {
    background-image: repeating-linear-gradient(90deg, transparent, transparent 19px, white 19px, white 20px);
  }
  .pattern-diagonal {
    background: repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px);
  }
  .pattern-stack {
    background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 4px);
  }
  .pattern-barcode {
    background-image: repeating-linear-gradient(90deg, currentColor, currentColor 2px, transparent 2px, transparent 4px, currentColor 4px, currentColor 8px, transparent 8px, transparent 9px);
  }
  .pattern-ticks {
    background-image: repeating-linear-gradient(90deg, black, black 1px, transparent 1px, transparent 20px);
  }
  .pattern-chunks {
    background-image: repeating-linear-gradient(90deg, transparent, transparent 10%, white 10%, white calc(10% + 4px));
  }
  .pattern-wide-ruler {
    background-image: repeating-linear-gradient(90deg, black, black 1px, transparent 1px, transparent 25%);
    background-size: 100% 100%;
  }
</style>