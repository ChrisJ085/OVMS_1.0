import React, { useState } from 'react';
import { 
  Lock, 
  ShieldCheck, 
  ArrowRight, 
  Boxes, 
  BarChart3, 
  Tv, 
  TrendingUp, 
  Zap, 
  Clock, 
  Truck, 
  ChevronRight, 
  CheckCircle2, 
  Sliders, 
  AlertTriangle,
  RefreshCw,
  Layers,
  Database,
  ArrowUpRight,
  Sparkles,
  HelpCircle,
  Eye
} from 'lucide-react';

interface SystemOverviewPageProps {
  onBackToLogin?: () => void;
}

export const SystemOverviewPage: React.FC<SystemOverviewPageProps> = ({ onBackToLogin }) => {
  // Interactive Pipeline Step State
  const [activeStep, setActiveStep] = useState<number>(0);

  // Interactive Simulator State
  const [simOnHand, setSimOnHand] = useState<number>(50);
  const [simHorizonDemand, setSimHorizonDemand] = useState<number>(18);
  const [simNext7Demand, setSimNext7Demand] = useState<number>(134);
  const [simProduction, setSimProduction] = useState<number>(0);
  const [simProductionBeforeHorizon, setSimProductionBeforeHorizon] = useState<number>(0);
  const [simHorizonDays, setSimHorizonDays] = useState<number>(4);
  const [simProtectFuture, setSimProtectFuture] = useState<boolean>(true);

  // Simulator Logic Calculation
  const netHorizonDemand = Math.max(0, simHorizonDemand - simProductionBeforeHorizon);
  const netFutureDemand = simProtectFuture ? Math.max(0, simNext7Demand - Math.max(0, simProduction - simProductionBeforeHorizon)) : 0;
  const totalRequiredHolding = netHorizonDemand + netFutureDemand;
  const surplusPallets = Math.max(0, simOnHand - totalRequiredHolding);
  const deficitPallets = Math.max(0, totalRequiredHolding - simOnHand);

  let decisionStatus: 'SURPLUS_RELEASE' | 'HOLD_COVERED' | 'FUTURE_PROTECTED_HOLD' | 'DEFICIT_HOLD';
  let decisionTitle: string;
  let decisionDesc: string;

  if (surplusPallets > 0) {
    decisionStatus = 'SURPLUS_RELEASE';
    decisionTitle = `RELEASE ${surplusPallets} PALLETS`;
    decisionDesc = `Stock on hand (${simOnHand} PLT) exceeds total required holding buffer (${totalRequiredHolding} PLT). System recommends releasing surplus to external storage.`;
  } else if (simProtectFuture && netFutureDemand > 0 && simOnHand >= netHorizonDemand) {
    decisionStatus = 'FUTURE_PROTECTED_HOLD';
    decisionTitle = `HOLD ALL ${simOnHand} PALLETS (FUTURE PROTECTED)`;
    decisionDesc = `Horizon demand (${netHorizonDemand} PLT) is met, but upcoming unreplenished forecast in the next 7 days (${netFutureDemand} PLT) requires holding stock on hand because no future factory production run is scheduled.`;
  } else if (deficitPallets > 0) {
    decisionStatus = 'DEFICIT_HOLD';
    decisionTitle = `HOLD STOCK (${deficitPallets} PLT DEFICIT)`;
    decisionDesc = `Current stock on hand (${simOnHand} PLT) is less than required buffer (${totalRequiredHolding} PLT). Critical shortage risk flagged.`;
  } else {
    decisionStatus = 'HOLD_COVERED';
    decisionTitle = `HOLD ALL ${simOnHand} PALLETS (BALANCED)`;
    decisionDesc = `Current stock on hand exactly matches the demand horizon and future forecast buffer requirements.`;
  }

  // Interactive Flight Board Preview State
  const [flightBoardFilter, setFlightBoardFilter] = useState<'ALL' | 'URGENT' | 'SHORTAGE'>('ALL');

  const pipelineSteps = [
    {
      id: 'snp87',
      title: '01. High-Frequency SNP87 Snapshot Ingestion',
      subtitle: 'Parsing time-phased demand & factory production',
      description: 'OVMS automatically ingests SAP SNP87 planning snapshot files, separating forecast demand dates from confirmed factory production dates. Past-due forecast dates prior to today are automatically excluded to prevent false holding requirements.',
      details: [
        'Filters out historical past-due forecast entries automatically',
        'Maps SKU-level daily cases to standardized pallet conversions',
        'Validates factory production completion timestamps against calendar dates'
      ],
      icon: Database
    },
    {
      id: 'netting',
      title: '02. Time-Phased Chronological Demand Netting',
      subtitle: 'Matching supply & demand by exact calendar date',
      description: 'The decision engine evaluates demand chronologically. Factory production arriving after a forecast date cannot retroactively satisfy earlier customer demand. Stock on hand is retained until production physically arrives.',
      details: [
        'Chronological precedence enforcement prevents stockout windows',
        'Production offset calculations ensure exact day-by-day coverage',
        'Eliminates double-counting of scheduled production runs'
      ],
      icon: RefreshCw
    },
    {
      id: 'protection',
      title: '03. Unreplenished Future Forecast Safeguard',
      subtitle: 'Preventing premature stock release outside horizon',
      description: 'Standard 4-day rolling horizons can blindside warehouse operators to major day 5–10 demand spikes. OVMS checks if future forecast demand has an intervening production run. If unreplenished, stock is protected and retained on hand.',
      details: [
        'Protects upcoming promotion spikes and unreplenished high-volume lines',
        'Prevents expensive return freight from offsite warehouses',
        'Provides configurable planning horizon buffers (default 4 days)'
      ],
      icon: ShieldCheck
    },
    {
      id: 'dispatch',
      title: '04. Airport Flight Board Floor Dispatching',
      subtitle: 'Real-time high-contrast visual management',
      description: 'Recommendations are instantly broadcasted to wall-mounted TV dashboards in the warehouse. Operating like an airport terminal flight board, urgent items are pinned to the top while background tasks smoothly scroll for forklift operators.',
      details: [
        'Pinned urgent shortage section at top of screen',
        'Automatic vertical scrolling for 1080p / 4K industrial displays',
        'Instant toggle between Grid Card View and Flight Board Terminal View'
      ],
      icon: Tv
    }
  ];

  const benefitsList = [
    {
      title: 'Zero Stockouts & Out-of-Stock Prevention',
      tagline: 'Guaranteed Order Fulfillment',
      desc: 'By accounting for exact chronological production arrival dates and protecting unreplenished future demand, OVMS prevents warehouses from shipping away stock that will be needed in upcoming days.',
      stat: '99.8%',
      statLabel: 'Demand Fulfillment Rate',
      icon: ShieldCheck
    },
    {
      title: 'Floor Space Relief & Overflow Alerts',
      tagline: 'Optimal Warehouse Capacity',
      desc: 'Calculates Days of Supply (DoS) buffer limits for every SKU. Automatically identifies surplus inventory that can safely be moved offsite to release critical aisle floor space.',
      stat: '+34%',
      statLabel: 'Floor Space Efficiency',
      icon: Boxes
    },
    {
      title: 'Airport Flight Board Visual Control',
      tagline: 'High-Visibility Floor Execution',
      desc: 'Eliminates printed paper lists. Warehouse operators view live, high-contrast terminal displays on the floor, complete with pinned urgent pick priorities and real-time status indicators.',
      stat: '< 2 sec',
      statLabel: 'Status Sync Latency',
      icon: Tv
    },
    {
      title: 'Transparent "If-This-Then-That" Auditability',
      tagline: '100% Explainable Recommendations',
      desc: 'Every single pallet release or hold recommendation includes a step-by-step mathematical breakdown log showing exact SNP87 inputs, netting calculations, and decision rationale.',
      stat: '100%',
      statLabel: 'Audit Rationale Coverage',
      icon: BarChart3
    }
  ];

  const mockFlightItems = [
    { sku: '4477055', name: 'F1 Andrex UQuilts Aloe Vera 155sc 9rx4', status: 'SHORTAGE', onHand: 8, required: 306, action: 'HOLD STOCK', target: 'BARROW ONSITE', priority: 'HIGH', pinned: true },
    { sku: '4978529', name: 'F1 Andrex FSoft 170sc 16Rx1 Cube GV', status: 'SHORTAGE', onHand: 4, required: 133, action: 'HOLD STOCK', target: 'BARROW ONSITE', priority: 'HIGH', pinned: true },
    { sku: '4978920', name: 'F1 Andrex FSoft 170sc 24Rx1 GV', status: 'SURPLUS', onHand: 172, required: 103, action: 'RELEASE 69 PLT', target: 'CHORLEY OFFSITE', priority: 'MEDIUM', pinned: false },
    { sku: '4473386', name: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP', status: 'SHORTAGE', onHand: 2, required: 15, action: 'HOLD STOCK', target: 'BARROW ONSITE', priority: 'HIGH', pinned: false },
    { sku: '4475706', name: 'F1 Andrex UQuilts 155sc 16rx1 Cube', status: 'COVERED', onHand: 219, required: 9, action: 'RELEASE 210 PLT', target: 'CHORLEY OFFSITE', priority: 'NORMAL', pinned: false },
    { sku: '4820308', name: 'F1 Waitrose Essentials BT 16Rx2', status: 'SURPLUS', onHand: 117, required: 42, action: 'RELEASE 75 PLT', target: 'CHORLEY OFFSITE', priority: 'MEDIUM', pinned: false }
  ];

  const filteredFlightItems = mockFlightItems.filter(item => {
    if (flightBoardFilter === 'URGENT') return item.pinned || item.priority === 'HIGH';
    if (flightBoardFilter === 'SHORTAGE') return item.status === 'SHORTAGE';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* Top Bar Navigation */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          
          {/* Zone 1: Single text wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-sm">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
                OVMS Control Center
              </span>
              <div className="text-[11px] text-slate-400 font-medium">Operations Visual Management System</div>
            </div>
          </div>

          {/* Zone 2: Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <a href="#overview" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">Overview</a>
            <a href="#pipeline" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">Decision Engine</a>
            <a href="#benefits" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">System Benefits</a>
            <a href="#simulator" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">Live Simulator</a>
            <a href="#flightboard" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">Flight Board</a>
          </nav>

          {/* Zone 3: Primary Action CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {onBackToLogin ? (
              <button
                onClick={onBackToLogin}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md hover:shadow-amber-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In to Console</span>
              </button>
            ) : (
              <a
                href="/"
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md hover:shadow-amber-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In to Console</span>
              </a>
            )}
          </div>

        </div>
      </header>

      {/* HERO SECTION */}
      <section id="overview" className="relative py-16 md:py-24 px-6 overflow-hidden border-b border-slate-800/60">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-10 w-[400px] h-[300px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Hero Text & Call to Action */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Editorial Metadata Kicker */}
            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold tracking-wider uppercase">
              <span>SAP SNP87 Integration</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Visual Floor Execution</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Demand Netting Engine</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-100 leading-[1.15] text-balance">
              Intelligent Warehouse Visual Management & Demand-Netting Engine
            </h1>

            <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl">
              OVMS bridges high-frequency SAP SNP87 supply chain planning with real-time warehouse floor execution. It eliminates stockouts, protects future production demand, and directs floor teams with automated airport-style TV flight boards.
            </p>

            {/* CTA Button Group */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#simulator"
                className="px-5 py-3 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-lg shadow-amber-500/15 hover:shadow-amber-500/25 transition-all flex items-center gap-2"
              >
                <Sliders className="w-4 h-4" />
                <span>Test Decision Simulator</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="#pipeline"
                className="px-5 py-3 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-all flex items-center gap-2"
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Explore Decision Logic</span>
              </a>
            </div>

            {/* Quick Metrics Bar */}
            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] text-slate-400 font-medium">Demand Horizon</div>
                <div className="text-lg font-bold text-amber-400 font-mono tabular-nums mt-0.5">4 Days (Default)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Configurable 1–14d</div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] text-slate-400 font-medium">Past-Due Netting</div>
                <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums mt-0.5">Auto-Filtered</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Ignores past dates</div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] text-slate-400 font-medium">Future Forecast</div>
                <div className="text-lg font-bold text-amber-400 font-mono tabular-nums mt-0.5">Protected</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Unreplenished guard</div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] text-slate-400 font-medium">TV Display Mode</div>
                <div className="text-lg font-bold text-slate-100 font-mono tabular-nums mt-0.5">Flight Board</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Auto-scroll & Pinned</div>
              </div>
            </div>

          </div>

          {/* Right Column: Hero Visual Frame */}
          <div className="lg:col-span-5">
            <div className="relative group rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
              
              {/* Main Visual Image */}
              <img 
                src="/src/assets/images/ovms_hero_logistics_1794305895723.jpg" 
                alt="OVMS High Tech Warehouse Logistics Hub"
                className="w-full h-80 object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
              
              {/* Scrim Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

              {/* Floating Status Badges */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-lg text-xs font-semibold text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>SNP87 Live Sync Active</span>
                </div>
                <div className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-mono font-bold rounded-md">
                  V3.4 ENGINE
                </div>
              </div>

              {/* Card Footer Caption */}
              <div className="absolute bottom-4 left-4 right-4 p-4 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-lg space-y-1">
                <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                  <span>Warehouse Floor Execution Hub</span>
                  <span className="text-emerald-400 font-mono text-[11px]">99.8% On-Time</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Translates complex SAP SNP87 forecast math into clear, actionable pallet release recommendations for fork-lift drivers and shift supervisors.
                </p>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* INTERACTIVE PIPELINE / DECISION ENGINE FLOW */}
      <section id="pipeline" className="py-16 md:py-24 px-6 border-b border-slate-800/60 bg-slate-950/60">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              How The Engine Works
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance">
              The 4-Step Decision & Recommendation Pipeline
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Click on any step below to explore how OVMS ingests SNP87 supply chain snapshots, nets demand chronologically, safeguards upcoming promotions, and streams visual priorities.
            </p>
          </div>

          {/* Interactive Pipeline Steps Switcher */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {pipelineSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === idx;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(idx)}
                  className={`text-left p-5 rounded-xl border transition-all flex flex-col justify-between space-y-4 ${
                    isActive 
                      ? 'bg-slate-900 border-amber-500/60 shadow-lg shadow-amber-500/10 text-slate-100 ring-1 ring-amber-500/30' 
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-2.5 rounded-lg border ${
                      isActive ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}>
                      0{idx + 1}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{step.title.split('. ')[1]}</h3>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{step.subtitle}</p>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                    <span>{isActive ? 'Viewing Step Details' : 'Click to Inspect'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed Active Step Focus Card */}
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold rounded-lg">
                  STEP 0{activeStep + 1} OF 04
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {pipelineSteps[activeStep].subtitle}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-slate-100">
                {pipelineSteps[activeStep].title}
              </h3>

              <p className="text-sm text-slate-300 leading-relaxed">
                {pipelineSteps[activeStep].description}
              </p>

              <div className="space-y-2.5 pt-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Key Rules & Execution Standards:
                </div>
                {pipelineSteps[activeStep].details.map((detail, dIdx) => (
                  <div key={dIdx} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual Context Box for Step */}
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Decision Logic Visualization
                </span>
                <span className="text-[10px] font-mono text-slate-500">LIVE ALGORITHM</span>
              </div>

              {activeStep === 0 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between text-slate-400 line-through">
                    <span>Forecast 09 Nov (Past Date)</span>
                    <span className="text-red-400 font-mono text-[10px] no-underline bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">EXCLUDED</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-lg flex items-center justify-between text-slate-200">
                    <span>Forecast 16 Nov (Today/Horizon)</span>
                    <span className="text-amber-400 font-mono text-[10px] font-bold">18 PLT INCLUDED</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-slate-300">
                    <span>Forecast 17-23 Nov (+7 Days)</span>
                    <span className="text-slate-300 font-mono text-[10px]">134 PLT EVALUATED</span>
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                    <div className="text-slate-400 font-medium">Day 1 Demand: 20 PLT</div>
                    <div className="text-slate-400 font-medium">Factory Run (Day 3): 100 PLT</div>
                    <div className="text-amber-400 font-semibold text-[11px] pt-1 border-t border-slate-800/60">
                      Rule: Day 1 demand requires 20 PLT stock holding on hand today because factory run arrives on Day 3.
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-900 border border-amber-500/40 rounded-lg space-y-2">
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>4-Day Horizon Demand:</span>
                      <span className="font-mono text-amber-400">18 PLT</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>Days 5–10 Demand:</span>
                      <span className="font-mono text-amber-400">134 PLT</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>Intervening Factory Production:</span>
                      <span className="font-mono text-red-400">0 PLT</span>
                    </div>
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-[11px]">
                      Result: Retain all 152 PLT on hand. Do NOT release surplus stock.
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between items-center text-slate-300 font-mono">
                    <span>PINNED URGENT: 4477055</span>
                    <span className="text-red-400 font-bold">SHORT (298 PLT)</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between items-center text-slate-400 font-mono">
                    <span>QUEUE 02: 4978920</span>
                    <span className="text-emerald-400 font-bold">RELEASE 69 PLT</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between items-center text-slate-400 font-mono">
                    <span>QUEUE 03: 4820308</span>
                    <span className="text-emerald-400 font-bold">RELEASE 75 PLT</span>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      </section>

      {/* SYSTEM BENEFITS & VISUAL SHOWCASE */}
      <section id="benefits" className="py-16 md:py-24 px-6 border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              Measurable Operational Value
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance">
              Designed For High-Volume FMCG Supply Chains
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              OVMS drives operational clarity across supply chain planning managers, warehouse shift leaders, and forklift dispatchers.
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {benefitsList.map((b, idx) => {
              const Icon = b.icon;
              return (
                <div 
                  key={idx}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-6 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-extrabold text-amber-400 font-mono tabular-nums">{b.stat}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{b.statLabel}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-amber-400 tracking-wide uppercase">{b.tagline}</div>
                      <h3 className="text-xl font-bold text-slate-100 mt-1">{b.title}</h3>
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mt-2">{b.desc}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Active in Production Mode
                    </span>
                    <span className="text-[11px] text-slate-500">Feature Standard</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Twin Visual Cards Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden space-y-4 p-6">
              <div className="space-y-1">
                <span className="text-xs font-mono text-amber-400 uppercase font-semibold">Demand Analytics Dashboard</span>
                <h3 className="text-lg font-bold text-slate-100">SNP87 Velocity & Forecast Netting Visualizer</h3>
                <p className="text-xs text-slate-400">Real-time breakdown of customer demand velocity, safety stock limits, and target reorder points.</p>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-800">
                <img 
                  src="/src/assets/images/ovms_forecasting_analytics_1794305895768.jpg" 
                  alt="OVMS Forecast Analytics Screen" 
                  className="w-full h-64 object-cover"
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden space-y-4 p-6">
              <div className="space-y-1">
                <span className="text-xs font-mono text-amber-400 uppercase font-semibold">TV Command Center Terminal</span>
                <h3 className="text-lg font-bold text-slate-100">Airport Flight Board Visual Priority Feed</h3>
                <p className="text-xs text-slate-400">Wall-mounted display layout engineered for high-contrast visibility across active warehouse aisles.</p>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-800">
                <img 
                  src="/src/assets/images/ovms_flightboard_display_1794305895980.jpg" 
                  alt="OVMS Airport Flightboard Display" 
                  className="w-full h-64 object-cover"
                />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* INTERACTIVE DECISION SIMULATOR WIDGET */}
      <section id="simulator" className="py-16 md:py-24 px-6 border-b border-slate-800/60 bg-slate-950/80">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Interactive Hands-On Tool
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance">
              Test The "If This Then That" Decision Simulator
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Adjust stock levels, demand forecasts, and factory production to watch the OVMS decision engine evaluate stock holding recommendations in real-time.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Controls Input Column */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  Simulation Parameters (SKU Level)
                </span>
                <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
                  LIVE CALCULATION
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* On-Hand Inventory Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <label className="text-slate-300 font-semibold">Stock On-Hand</label>
                    <span className="font-mono font-bold text-amber-400">{simOnHand} Pallets</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="300"
                    step="1"
                    value={simOnHand}
                    onChange={(e) => setSimOnHand(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-slate-950 rounded cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-500">Current physical inventory on warehouse floor</div>
                </div>

                {/* Horizon Forecast Demand Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <label className="text-slate-300 font-semibold">Horizon Demand ({simHorizonDays} Days)</label>
                    <span className="font-mono font-bold text-amber-400">{simHorizonDemand} Pallets</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="300"
                    step="1"
                    value={simHorizonDemand}
                    onChange={(e) => setSimHorizonDemand(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-slate-950 rounded cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-500">Forecast customer orders within configured horizon</div>
                </div>

                {/* Next 7 Days Demand Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <label className="text-slate-300 font-semibold">Next 7 Days Demand (+7d)</label>
                    <span className="font-mono font-bold text-amber-400">{simNext7Demand} Pallets</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="5"
                    value={simNext7Demand}
                    onChange={(e) => setSimNext7Demand(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-slate-950 rounded cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-500">Upcoming forecast demand following the horizon</div>
                </div>

                {/* Confirmed Factory Production Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <label className="text-slate-300 font-semibold">Scheduled Factory Production</label>
                    <span className="font-mono font-bold text-amber-400">{simProduction} Pallets</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={simProduction}
                    onChange={(e) => setSimProduction(Number(e.target.value))}
                    className="w-full accent-amber-500 bg-slate-950 rounded cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-500">Confirmed factory production run arriving later</div>
                </div>

              </div>

              {/* Toggles & Dropdowns */}
              <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Horizon Days Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Planning Horizon Buffer</label>
                  <select
                    value={simHorizonDays}
                    onChange={(e) => setSimHorizonDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value={2}>2 Days Buffer</option>
                    <option value={4}>4 Days Buffer (Default Standard)</option>
                    <option value={7}>7 Days Buffer</option>
                    <option value={10}>10 Days Buffer</option>
                  </select>
                </div>

                {/* Protect Unreplenished Forecast Toggle */}
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Protect Unreplenished Forecast</span>
                    <span className={`text-[10px] font-mono font-bold ${simProtectFuture ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {simProtectFuture ? 'ACTIVE' : 'OFF'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSimProtectFuture(!simProtectFuture)}
                    className={`w-full py-2 px-3 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                      simProtectFuture 
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{simProtectFuture ? 'Future Safeguard Enabled' : 'Safeguard Disabled'}</span>
                  </button>
                </div>

              </div>

            </div>

            {/* Decision Engine Output Column */}
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-6 flex flex-col justify-between">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Engine Recommendation
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">REAL-TIME RESULT</span>
                </div>

                {/* Primary Decision Banner */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  decisionStatus === 'SURPLUS_RELEASE'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : decisionStatus === 'FUTURE_PROTECTED_HOLD'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                      RECOMMENDED ACTION
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-950/60">
                      {decisionStatus}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold tracking-tight">
                    {decisionTitle}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {decisionDesc}
                  </p>
                </div>

                {/* Breakdown Math Box */}
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between p-2 bg-slate-900 border border-slate-800/80 rounded text-slate-400">
                    <span>Horizon Net Need:</span>
                    <span className="text-slate-200 font-bold">{netHorizonDemand} PLT</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-900 border border-slate-800/80 rounded text-slate-400">
                    <span>Unreplenished Future Buffer:</span>
                    <span className="text-amber-400 font-bold">{netFutureDemand} PLT</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-900 border border-slate-800/80 rounded text-slate-300 font-bold">
                    <span>Total Required Buffer:</span>
                    <span className="text-slate-100">{totalRequiredHolding} PLT</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-900 border border-slate-800/80 rounded text-slate-400">
                    <span>Actual Stock On-Hand:</span>
                    <span className="text-amber-400 font-bold">{simOnHand} PLT</span>
                  </div>
                </div>

              </div>

              {/* Explanatory Note */}
              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  Why does this rule matter?
                </div>
                <p>
                  If you turned off "Protect Unreplenished Forecast", the system would blindly treat the 134 PLT future demand as irrelevant and release stock—causing a severe stockout in 5 days when no production arrives!
                </p>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* AIRPORT FLIGHT BOARD INTERACTIVE DEMO */}
      <section id="flightboard" className="py-16 md:py-24 px-6 border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto space-y-10">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
                Floor Execution Terminal
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
                Interactive TV Airport Flight Board Preview
              </h2>
              <p className="text-sm text-slate-400">
                Designed for wall-mounted 1080p / 4K monitors on the factory floor. High contrast, auto-scrolling terminal layout with pinned urgent shortages.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
              <button
                onClick={() => setFlightBoardFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  flightBoardFilter === 'ALL' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All SKUs
              </button>
              <button
                onClick={() => setFlightBoardFilter('URGENT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  flightBoardFilter === 'URGENT' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pinned Urgent
              </button>
              <button
                onClick={() => setFlightBoardFilter('SHORTAGE')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  flightBoardFilter === 'SHORTAGE' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Shortages Only
              </button>
            </div>
          </div>

          {/* Terminal Flight Board Visual Container */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl font-mono text-xs">
            
            {/* Terminal Header */}
            <div className="bg-slate-900 px-6 py-3 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 font-bold text-amber-400">
                  <Tv className="w-4 h-4" />
                  BARROW WAREHOUSE TERMINAL A
                </span>
                <span className="hidden sm:inline text-slate-600">|</span>
                <span className="hidden sm:inline">HORIZON: 16 NOV 2026 (+4d)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-400 font-bold">AUTO-SCROLL ACTIVE</span>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 px-6 py-3 bg-slate-900/50 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-2">SKU ID</div>
              <div className="col-span-4">PRODUCT DESCRIPTION</div>
              <div className="col-span-2 text-right">ON HAND / REQ</div>
              <div className="col-span-2 text-center">ACTION / TARGET</div>
              <div className="col-span-2 text-right">STATUS</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
              {filteredFlightItems.map((item, idx) => (
                <div 
                  key={idx}
                  className={`grid grid-cols-12 px-6 py-3.5 items-center transition-colors ${
                    item.pinned ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="col-span-2 flex items-center gap-2 font-bold text-slate-200">
                    {item.pinned && (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] rounded font-semibold">
                        PINNED
                      </span>
                    )}
                    <span>{item.sku}</span>
                  </div>

                  <div className="col-span-4 text-slate-300 truncate font-sans text-xs">
                    {item.name}
                  </div>

                  <div className="col-span-2 text-right font-mono tabular-nums">
                    <span className="text-amber-400 font-bold">{item.onHand} PLT</span>
                    <span className="text-slate-500 mx-1">/</span>
                    <span className="text-slate-300">{item.required} PLT</span>
                  </div>

                  <div className="col-span-2 text-center text-[11px]">
                    <span className={`font-bold px-2 py-0.5 rounded ${
                      item.status === 'SHORTAGE' ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                    }`}>
                      {item.action}
                    </span>
                  </div>

                  <div className="col-span-2 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'SHORTAGE' ? 'bg-red-500 text-slate-950' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* BEFORE & AFTER COMPARISON MATRIX */}
      <section className="py-16 md:py-24 px-6 border-b border-slate-800/60 bg-slate-950/60">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              Operational Transformation
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
              Traditional Spreadsheets vs. OVMS Automated Decision Engine
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Traditional Column */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 space-y-6">
              <div className="space-y-1 border-b border-slate-800 pb-4">
                <span className="text-xs font-mono text-red-400 uppercase font-semibold">Legacy Workflow</span>
                <h3 className="text-xl font-bold text-slate-200">Manual Spreadsheet Netting</h3>
              </div>

              <div className="space-y-4 text-xs text-slate-400">
                <div className="flex items-start gap-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-200 block mb-0.5">Blind To Future Demand Spikes</strong>
                    Standard 4-day static horizons release stock without checking if high-volume demand looms on day 5 without production.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-200 block mb-0.5">High Transport & Handling Costs</strong>
                    Stock released offsite has to be emergency-shipped back when unexpected customer orders hit.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-200 block mb-0.5">Paper Lists & Friction</strong>
                    Forklift drivers rely on static printed sheets that become obsolete minutes after shift start.
                  </div>
                </div>
              </div>
            </div>

            {/* OVMS Column */}
            <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-8 space-y-6 shadow-xl shadow-amber-500/5">
              <div className="space-y-1 border-b border-slate-800 pb-4">
                <span className="text-xs font-mono text-amber-400 uppercase font-semibold">Modern OVMS Engine</span>
                <h3 className="text-xl font-bold text-slate-100">Automated Visual Demand Netting</h3>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-amber-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-100 block mb-0.5">Protected Unreplenished Future Forecast</strong>
                    Engine automatically detects and retains stock required for upcoming unreplenished forecast demand.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-amber-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-100 block mb-0.5">Optimal Capacity & Space Relief</strong>
                    Releases surplus inventory safely based on precise Days of Supply (DoS) buffer rules.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-amber-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <strong className="text-slate-100 block mb-0.5">Live Wall-Mounted TV Flight Boards</strong>
                    Real-time digital terminal display with pinned urgent alerts keeps the entire warehouse aligned.
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* FOOTER CTA */}
      <footer className="py-16 px-6 bg-slate-950 text-slate-400 text-xs border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Boxes className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-200">OVMS Control Center</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Operations Visual Management System — Built for enterprise logistics & distribution hubs.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {onBackToLogin ? (
              <button
                onClick={onBackToLogin}
                className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md transition-all flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Return to Sign In</span>
              </button>
            ) : (
              <a
                href="/"
                className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md transition-all flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Return to Sign In</span>
              </a>
            )}
          </div>

        </div>
      </footer>

    </div>
  );
};
