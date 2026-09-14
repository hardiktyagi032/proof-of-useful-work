import { useMemo, useState } from 'react'
import {
  defaultConfig,
  detectionProbability,
  formatCompact,
  formatPercent,
  runSimulation,
  scenarios,
  strategyOptions,
} from './simulation.js'
import { CryptoPoUSNetwork } from './cryptoSimulation.js'

const tabs = [
  ['overview', 'Overview'],
  ['network', 'Node network'],
  ['assignments', 'Assignments'],
  ['audits', 'Hidden audits'],
  ['disputes', 'Disputes'],
  ['rewards', 'Rewards'],
  ['validation', 'Validation lab'],
  ['crypto', 'Crypto PoUS Lab'],
]

const Icon = ({ name, size = 18 }) => {
  const paths = {
    mark: <><path d="M12 2.5 4.8 6.6v8.8L12 19.5l7.2-4.1V6.6L12 2.5Z"/><path d="m8.4 11.7 2.2 2.1 4.8-5"/></>,
    play: <path d="m8 5 9 7-9 7V5Z"/>,
    refresh: <><path d="M19 8a7.5 7.5 0 1 0 .4 7"/><path d="M19 3v5h-5"/></>,
    nodes: <><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/><path d="m10.7 7.2-4.4 7.6m7-7.6 4.4 7.6M7.5 17h9"/></>,
    shield: <path d="M12 3 5 6v5c0 4.8 2.9 8 7 10 4.1-2 7-5.2 7-10V6l-7-3Z"/>,
    branch: <><path d="M6 4v11a4 4 0 0 0 4 4h8"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="19" r="2"/><path d="M15 5h4v4m0-4-7 7"/></>,
    coin: <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6m-14 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
    flask: <><path d="M9 3h6m-5 0v5l-5.2 9a2.7 2.7 0 0 0 2.4 4h9.6a2.7 2.7 0 0 0 2.4-4L14 8V3"/><path d="M7.2 15h9.6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9h.01"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function MetricCard({ label, value, detail, tone = 'mint', bar }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-dot" /></div>
      <strong>{value}</strong>
      <small>{detail}</small>
      {bar !== undefined && <div className="micro-bar"><i style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} /></div>}
    </article>
  )
}

function StrategySelect({ label, category, value, onChange }) {
  const selected = strategyOptions[category].find((item) => item.id === value)
  return (
    <label className="strategy-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {strategyOptions[category].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <small>{selected.description}</small>
    </label>
  )
}

function LineChart({ rounds }) {
  const width = 640
  const height = 220
  const points = rounds.map((item, index) => `${34 + index * ((width - 54) / (rounds.length - 1))},${height - 28 - item.accuracy * 150}`).join(' ')
  const area = `34,${height - 28} ${points} ${width - 20},${height - 28}`
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Model accuracy by training round">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="34" x2={width - 20} y1={32 + line * 44} y2={32 + line * 44} className="grid-line" />)}
        <polygon points={area} className="chart-area" />
        <polyline points={points} className="chart-line" />
        {rounds.map((item, index) => <circle key={index} cx={34 + index * ((width - 54) / (rounds.length - 1))} cy={height - 28 - item.accuracy * 150} r="3" className="chart-point"><title>Round {item.round}: {formatPercent(item.accuracy)}</title></circle>)}
      </svg>
      <div className="chart-axis"><span>Round 1</span><span>Round 8</span><span>Round 16</span></div>
    </div>
  )
}

function NodeMatrix({ nodes, onSelect, selectedId, limit = 240 }) {
  const shown = nodes.slice(0, limit)
  return (
    <div className="node-matrix" style={{ '--columns': Math.min(24, Math.ceil(Math.sqrt(shown.length * 1.7))) }}>
      {shown.map((node) => (
        <button
          key={node.id}
          title={`Node ${node.id} · ${node.status} · ${node.accepted} accepted units`}
          className={`node-cell ${node.status} ${selectedId === node.id ? 'selected' : ''}`}
          onClick={() => onSelect(node.id)}
        ><span>{node.id}</span></button>
      ))}
    </div>
  )
}

function StatusLegend() {
  return <div className="legend"><span><i className="verified" />Verified</span><span><i className="disputed" />Caught</span><span><i className="escaped" />Escaped</span><span><i className="dropped" />Dropped</span></div>
}

function FlowStep({ index, title, detail, active }) {
  return <div className={`flow-step ${active ? 'active' : ''}`}><b>{index}</b><div><strong>{title}</strong><small>{detail}</small></div></div>
}

function Overview({ result, setTab }) {
  const { metrics, rounds } = result
  return (
    <div className="tab-content">
      <section className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">PROTOCOL SIMULATION · EPOCH 01</span>
          <h1>See useful work<br />become <em>verifiable.</em></h1>
          <p>Explore how training commitments, unpredictable overlap audits, stake, and disputes interact before the protocol touches a real chain.</p>
          <div className="hero-actions"><button className="primary" onClick={() => setTab('network')}><Icon name="nodes" /> Inspect network</button><button className="secondary" onClick={() => setTab('validation')}><Icon name="flask" /> Open validation lab</button></div>
        </div>
        <div className="protocol-orbit" aria-label="Protocol flow visualization">
          <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
          <div className="orbit-core"><Icon name="mark" size={32}/><strong>P.O.U.S.</strong><small>epoch root</small></div>
          <span className="orbit-node n1">Commit</span><span className="orbit-node n2">Audit</span><span className="orbit-node n3">Prove</span><span className="orbit-node n4">Reward</span>
        </div>
      </section>
      <section className="metrics-grid">
        <MetricCard label="Detection rate" value={formatPercent(metrics.detectionRate, 2)} detail={`${metrics.detectedMalicious} of ${metrics.maliciousTotal} active adversaries`} bar={metrics.detectionRate}/>
        <MetricCard label="Useful-work ratio" value={formatPercent(metrics.usefulRatio)} detail={`${formatCompact(metrics.acceptedWork)} units accepted`} tone="blue" bar={metrics.usefulRatio}/>
        <MetricCard label="Audit overhead" value={formatPercent(metrics.auditOverhead)} detail={`${formatCompact(metrics.redundantWork)} redundant units`} tone="amber" bar={Math.min(1, metrics.auditOverhead)}/>
        <MetricCard label="Consensus safety" value={formatPercent(metrics.consensusSafety)} detail={`quorum ${metrics.quorum} · committee active`} tone="violet" bar={metrics.consensusSafety}/>
      </section>
      <section className="dashboard-grid">
        <article className="panel span-2"><div className="panel-head"><div><span className="eyebrow">MODEL TRAJECTORY</span><h2>Accuracy across accepted rounds</h2></div><span className="live-pill"><i/>live model</span></div><LineChart rounds={rounds}/></article>
        <article className="panel"><div className="panel-head"><div><span className="eyebrow">EPOCH PIPELINE</span><h2>Current verification path</h2></div></div><div className="flow-list"><FlowStep index="01" title="Assign" detail="Stake-capped work allocation" active/><FlowStep index="02" title="Commit" detail="Trace roots locked" active/><FlowStep index="03" title="Audit" detail={`${metrics.checksPerNode} hidden checks per worker`} active/><FlowStep index="04" title="Resolve" detail={`${metrics.disputes} disputes opened`} active={metrics.disputes > 0}/><FlowStep index="05" title="Settle" detail="Verified work rewarded" /></div></article>
      </section>
    </div>
  )
}

function NetworkTab({ result }) {
  const [selectedId, setSelectedId] = useState(1)
  const selected = result.nodes.find((node) => node.id === selectedId) || result.nodes[0]
  return <div className="tab-content"><SectionIntro eyebrow="NODE NETWORK" title="One network, inspectable at every scale" text="The matrix renders a representative node sample while metrics are calculated across the complete population."/>
    <section className="network-layout"><article className="panel network-panel"><div className="panel-head"><div><h2>Node status matrix</h2><p>Showing {Math.min(240, result.nodes.length)} of {result.nodes.length} nodes</p></div><StatusLegend/></div><NodeMatrix nodes={result.nodes} onSelect={setSelectedId} selectedId={selectedId}/></article>
    <article className="panel inspector"><span className={`status-badge ${selected.status}`}>{selected.status}</span><h2>Node {String(selected.id).padStart(4, '0')}</h2><p className="mono">worker://epoch-01/{selected.id}</p><div className="inspector-grid"><Stat label="Assigned" value={formatCompact(selected.assigned)}/><Stat label="Accepted" value={formatCompact(selected.accepted)}/><Stat label="Stake" value={selected.stake.toFixed(0)}/><Stat label="Capacity" value={`${selected.capacity.toFixed(2)}×`}/><Stat label="Quality" value={formatPercent(selected.quality)}/><Stat label="Reward" value={selected.reward.toFixed(2)}/></div><div className="trace-box"><span>Commitment trace</span><code>0x{Math.abs((selected.id * 2654435761) | 0).toString(16).padStart(8, '0')}…{Math.round(selected.quality * 10000).toString(16)}</code></div></article></section></div>
}

function AssignmentsTab({ result, config }) {
  const buckets = [0, 0, 0, 0, 0]
  const max = Math.max(...result.nodes.map((node) => node.assigned))
  result.nodes.forEach((node) => { buckets[Math.min(4, Math.floor((node.assigned / max) * 5))]++ })
  return <div className="tab-content"><SectionIntro eyebrow="ASSIGNMENT MODULE" title="Swap the rule that divides useful work" text="Assignments are canonical training units. Stake limits responsibility; it does not multiply the eventual reward."/>
    <section className="dashboard-grid"><article className="panel span-2"><div className="panel-head"><div><h2>Workload distribution</h2><p>{formatCompact(config.workUnits)} units across {config.nodeCount} workers</p></div></div><div className="histogram">{buckets.map((value, index) => <div key={index}><i style={{ height: `${(value / Math.max(...buckets)) * 100}%` }}><span>{value}</span></i><small>{index === 0 ? 'light' : index === 4 ? 'heavy' : `tier ${index + 1}`}</small></div>)}</div></article><article className="panel"><h2>Assignment contract</h2><div className="formula"><span>eligibility</span><code>Sᵢ ≥ κ · Aᵢ</code></div><div className="formula"><span>task seed</span><code>H(epoch ∥ worker ∥ VRF)</code></div><div className="formula"><span>strategy</span><code>{config.assignment}</code></div><p className="callout"><Icon name="info"/> A worker may accept less work without penalty. Dishonesty and non-availability are treated separately.</p></article></section></div>
}

function AuditsTab({ result, config }) {
  const selected = result.nodes.find((node) => node.malicious && !node.dropped) || result.nodes[0]
  const probabilities = [5, 10, 20, 40, 80, 120].map((checks) => ({ checks, probability: detectionProbability(config.corruptionRate, checks, config.audit) }))
  return <div className="tab-content"><SectionIntro eyebrow="HIDDEN AUDIT MODULE" title="Commit first. Learn the checks later." text="Different slices of one worker’s trace are cross-checked by different committees, making selective honest computation risky."/>
    <section className="audit-layout"><article className="panel audit-map"><div className="panel-head"><div><h2>Overlap map · Node {selected.id}</h2><p>Illustrative post-commit committee assignment</p></div><span className="live-pill"><i/>seed finalized</span></div><div className="worker-spine"><div className="worker-card"><Icon name="nodes" size={28}/><strong>Worker {selected.id}</strong><small>trace root committed</small></div>{[1,2,3,4].map((audit, index) => <div className="audit-branch" key={audit}><span className="branch-label">slice {12 + index * 17}</span><div className="committee-row">{Array.from({length: Math.min(7, config.committeeSize)}, (_, member) => <i key={member} className={member < result.metrics.quorum ? 'agree' : ''}>{((selected.id + audit * 13 + member * 7) % config.nodeCount) + 1}</i>)}</div><b>{result.metrics.quorum}/{config.committeeSize}</b></div>)}</div></article>
    <article className="panel probability-panel"><h2>Detection curve</h2><p>Assuming {formatPercent(config.corruptionRate)} of a trace is corrupt.</p><div className="probability-list">{probabilities.map((item) => <div key={item.checks}><span>{item.checks} checks</span><div><i style={{width: `${item.probability * 100}%`}}/></div><strong>{formatPercent(item.probability, 2)}</strong></div>)}</div><p className="callout"><Icon name="info"/> Sampling approaches certainty but is never mathematically absolute unless every potentially corrupt unit is checked.</p></article></section></div>
}

function DisputesTab({ result, config }) {
  const disputes = result.nodes.filter((node) => node.detected).slice(0, 8)
  return <div className="tab-content"><SectionIntro eyebrow="DISPUTE MODULE" title="Find one bad transition without replaying the epoch" text="Merkle bisection localizes disagreement; a one-step proof adjudicates the conflicting state transition."/>
    <section className="dashboard-grid"><article className="panel span-2"><div className="panel-head"><div><h2>Resolution trace</h2><p>{config.dispute === 'merkle-zk' ? 'Interactive bisection + zero-knowledge adjudication' : strategyOptions.dispute.find((s) => s.id === config.dispute).label}</p></div></div><div className="bisection"><div className="segment full">1,024 steps</div><Icon name="chevron"/><div className="segment half">512</div><Icon name="chevron"/><div className="segment quarter">256</div><Icon name="chevron"/><div className="segment final">1 disputed transition</div></div><div className="proof-statement"><span>Public statement</span><code>Verify(taskRoot, stateₜ, batchRoot, stateₜ₊₁, traceRoot)</code><span>Private witness</span><code>model state · optimizer · batch · activations · Merkle paths</code></div></article><article className="panel"><h2>Open disputes</h2>{disputes.length ? <div className="dispute-list">{disputes.map((node) => <div key={node.id}><i>#{node.id}</i><span>audit mismatch</span><b>ZK pending</b></div>)}</div> : <div className="empty-state"><Icon name="shield" size={32}/><strong>No disputes</strong><span>This epoch is clean.</span></div>}</article></section></div>
}

function RewardsTab({ result, config }) {
  const top = [...result.nodes].sort((a,b) => b.reward-a.reward).slice(0, 12)
  const max = top[0]?.reward || 1
  return <div className="tab-content"><SectionIntro eyebrow="REWARD MODULE" title="Pay for accepted work, not declared power" text="Training, auditing, and block production remain separate economic roles so redundant checks cannot inflate model contribution."/>
    <section className="rewards-layout"><article className="panel"><div className="panel-head"><div><h2>Epoch reward split</h2><p>Total pool · {formatCompact(config.rewardPool)} tokens</p></div></div><div className="donut" style={{background:`conic-gradient(#67e7b2 0 72%, #75a9ff 72% 92%, #f2bc67 92% 100%)`}}><div><strong>{formatCompact(config.rewardPool)}</strong><small>tokens</small></div></div><div className="reward-legend"><span><i className="training"/>Training <b>72%</b></span><span><i className="auditing"/>Auditing <b>20%</b></span><span><i className="proposer"/>Proposer <b>8%</b></span></div></article><article className="panel span-2"><div className="panel-head"><div><h2>Top verified contributors</h2><p>Current strategy · {strategyOptions.reward.find((s)=>s.id===config.reward).label}</p></div></div><div className="ranking">{top.map((node,index)=><div key={node.id}><em>{String(index+1).padStart(2,'0')}</em><span>Node {node.id}<small>{formatCompact(node.accepted)} accepted units</small></span><div><i style={{width:`${node.reward/max*100}%`}}/></div><b>{node.reward.toFixed(1)}</b></div>)}</div></article></section></div>
}

function ValidationTab({ config, setConfig, result, run, history }) {
  return <div className="tab-content"><SectionIntro eyebrow="VALIDATION LAB" title="Stress the assumptions before they become claims" text="Change the adversary, protocol strategy, and scale. Every run is deterministic for a fixed seed."/>
    <section className="validation-layout"><article className="panel controls-panel"><h2>Adversarial conditions</h2><Range label="Malicious nodes" value={config.maliciousRate} max={0.6} step={0.01} display={formatPercent(config.maliciousRate)} onChange={(v)=>setConfig({...config,maliciousRate:v})}/><Range label="Collusion within malicious set" value={config.collusionRate} max={1} step={0.01} display={formatPercent(config.collusionRate)} onChange={(v)=>setConfig({...config,collusionRate:v})}/><Range label="Corrupted work per attacker" value={config.corruptionRate} max={0.8} step={0.01} display={formatPercent(config.corruptionRate)} onChange={(v)=>setConfig({...config,corruptionRate:v})}/><Range label="Honest dropout" value={config.dropoutRate} max={0.5} step={0.01} display={formatPercent(config.dropoutRate)} onChange={(v)=>setConfig({...config,dropoutRate:v})}/><button className="primary full-button" onClick={run}><Icon name="play"/> Run validation</button></article>
    <article className="panel validation-results"><div className="panel-head"><div><h2>Run result</h2><p>seed {config.seed} · {config.nodeCount} nodes</p></div><span className={result.metrics.consensusSafety > .8 ? 'pass-pill':'warn-pill'}>{result.metrics.consensusSafety>.8?'PASS':'RISK'}</span></div><div className="validation-score"><strong>{formatPercent(result.metrics.detectionRate,2)}</strong><span>fraud detection</span></div><div className="validation-checks"><Check label="Consensus safety" passed={result.metrics.consensusSafety>.8} value={formatPercent(result.metrics.consensusSafety)}/><Check label="Useful-work ratio" passed={result.metrics.usefulRatio>.45} value={formatPercent(result.metrics.usefulRatio)}/><Check label="Escaped adversaries" passed={result.metrics.escapedMalicious===0} value={`${result.metrics.escapedMalicious}`}/><Check label="Verification latency" passed={result.metrics.verificationLatency<1000} value={`${result.metrics.verificationLatency.toFixed(0)} ms`}/></div></article>
    <article className="panel history-panel"><h2>Recent deterministic runs</h2>{history.length ? history.map((item,index)=><div className="history-row" key={item.timestamp}><span>#{history.length-index}</span><b>{item.config.nodeCount} nodes</b><em>{formatPercent(item.metrics.detectionRate)}</em><small>{item.config.audit}</small></div>) : <div className="empty-state small"><Icon name="flask"/><span>Run a scenario to build comparison history.</span></div>}</article></section></div>
}

function createDefaultCryptoNetwork() {
  const net = new CryptoPoUSNetwork({
    stakeWeightAlpha: 0.6,
    workWeightBeta: 0.4,
    blockReward: 50,
    slashPenaltyRatio: 0.2,
  })
  net.registerNode('Validator_Alpha', 2000, 600, false)
  net.registerNode('Validator_Beta', 1500, 400, false)
  net.registerNode('Miner_Gamma', 800, 150, false)
  net.registerNode('Miner_Delta', 600, 100, false)
  net.registerNode('Adversary_Malory', 1000, 350, true)
  return net
}

function CryptoTab() {
  const [cryptoNet, setCryptoNet] = useState(() => createDefaultCryptoNetwork())
  const [snap, setSnap] = useState(() => cryptoNet.getSnapshot())
  const [txFrom, setTxFrom] = useState('Validator_Alpha')
  const [txTo, setTxTo] = useState('Miner_Gamma')
  const [txAmount, setTxAmount] = useState(25)
  const [statusMsg, setStatusMsg] = useState('')

  const refresh = () => setSnap(cryptoNet.getSnapshot())

  const handleMine = () => {
    const res = cryptoNet.mineNextBlock()
    if (!res) {
      setStatusMsg('Mining failed: No eligible nodes with stake')
    } else if (res.success) {
      setStatusMsg(`Success: Block #${res.block.index} minted by ${res.block.proposer}! Useful proof verified.`)
    } else {
      setStatusMsg(`Security Alert: Node ${res.slashed} submitted invalid PoUW proof and was slashed ${res.penalty.toFixed(1)} tokens!`)
    }
    refresh()
  }

  const handleSimulateRounds = (count = 5) => {
    let minted = 0
    let slashed = 0
    for (let i = 0; i < count; i++) {
      const res = cryptoNet.mineNextBlock()
      if (res?.success) minted++
      else if (res?.slashed) slashed++
    }
    setStatusMsg(`Simulated ${count} rounds: ${minted} blocks minted, ${slashed} invalid proposals caught and slashed.`)
    refresh()
  }

  const handleSendTx = (e) => {
    e.preventDefault()
    try {
      cryptoNet.addTransaction(txFrom, txTo, Number(txAmount), 1)
      setStatusMsg(`Tx queued in mempool: ${txFrom} -> ${txTo} (${txAmount} tokens)`)
      refresh()
    } catch (err) {
      setStatusMsg(`Tx Error: ${err.message}`)
    }
  }

  const handleReset = () => {
    const nextNet = createDefaultCryptoNetwork()
    setCryptoNet(nextNet)
    setSnap(nextNet.getSnapshot())
    setStatusMsg('Cryptocurrency network reset to genesis.')
  }

  return (
    <div className="tab-content crypto-layout">
      <SectionIntro
        eyebrow="CRYPTOCURRENCY TESTBED"
        title="Live Proof of Useful Stake (PoUS) Simulation"
        text="Block production probability is proportional to (Stake)^0.6 × (Useful_Work_Credits + 1)^0.4. Proposers must compute verifiable useful matrix optimization solutions; fraud is cryptographically caught and slashed."
      />

      <section className="metrics-grid">
        <MetricCard label="Block Height" value={`#${snap.blockHeight}`} detail="Current chain length" tone="mint" />
        <MetricCard label="Active Nodes" value={`${snap.nodes.length}`} detail="Validators and Miners" tone="blue" />
        <MetricCard label="Mempool Tx" value={`${snap.pendingTxs.length}`} detail="Pending in queue" tone="amber" />
        <MetricCard label="Next Task" value={`Task #${snap.currentTaskId}`} detail={`Target MSE < ${snap.targetLoss}`} tone="violet" />
      </section>

      {statusMsg && (
        <div className="callout" style={{ borderLeft: '3px solid var(--mint)' }}>
          <Icon name="info" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="crypto-actions">
        <button className="primary" onClick={handleMine}>
          <Icon name="play" /> Mint Next Block (PoUS)
        </button>
        <button className="secondary" onClick={() => handleSimulateRounds(5)}>
          Fast-Forward 5 Epochs
        </button>
        <button className="secondary" onClick={() => handleSimulateRounds(20)}>
          Simulate 20 Epochs
        </button>
        <button className="secondary" onClick={handleReset}>
          <Icon name="refresh" /> Reset to Genesis
        </button>
      </div>

      <div className="crypto-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Validator & Miner Accounts</h2>
              <p>Staked balances and useful computational score determine proposal weight.</p>
            </div>
          </div>

          <table className="crypto-table">
            <thead>
              <tr>
                <th>Node ID</th>
                <th>Type</th>
                <th>Stake</th>
                <th>Balance</th>
                <th>Useful Credits</th>
                <th>Weight</th>
                <th>Blocks</th>
              </tr>
            </thead>
            <tbody>
              {snap.nodes.map((node) => (
                <tr key={node.id}>
                  <td className="mono"><strong>{node.id}</strong></td>
                  <td>
                    {node.isAdversarial ? (
                      <span className="badge-adv">Adversary</span>
                    ) : (
                      <span className="badge-honest">Honest</span>
                    )}
                  </td>
                  <td className="mono">{node.stake.toFixed(1)}</td>
                  <td className="mono">{node.balance.toFixed(1)}</td>
                  <td className="mono">+{node.usefulCredits}</td>
                  <td className="mono"><strong>{node.weight}</strong></td>
                  <td className="mono">{node.totalBlocksProposed}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form className="tx-form" onSubmit={handleSendTx}>
            <span className="eyebrow" style={{ width: '100%' }}>Create Transaction</span>
            <label>From:
              <select value={txFrom} onChange={(e) => setTxFrom(e.target.value)}>
                {snap.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
              </select>
            </label>
            <label>To:
              <select value={txTo} onChange={(e) => setTxTo(e.target.value)}>
                {snap.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
              </select>
            </label>
            <label>Amount:
              <input type="number" min="1" max="500" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
            </label>
            <button type="submit" className="primary" style={{ padding: '6px 12px' }}>Send Tx</button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent Blocks & Verifiable PoUW</h2>
              <p>Each block includes a verified computational problem payload.</p>
            </div>
          </div>

          <div className="block-list">
            {snap.blocks.map((block) => (
              <div className="block-card" key={block.index}>
                <div className="block-card-header">
                  <strong>Block #{block.index}</strong>
                  <span className="live-pill">Proposer: {block.proposer}</span>
                </div>
                <div className="block-details">
                  <div>Hash: <code>{block.hash.slice(0, 16)}...</code></div>
                  <div>Txs: {block.transactions.length} included</div>
                  <div>Useful Task: #{block.usefulProof.taskId}</div>
                  <div>MSE Loss: {block.usefulProof.loss} (Verified)</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '16px' }}>
            <h2>Consensus & Slashing Events</h2>
            <div className="event-log-container">
              {snap.eventLog.slice(0, 12).map((item) => (
                <div className="event-log-item" key={item.id}>
                  <span className="event-log-time">[{new Date(item.timestamp).toLocaleTimeString()}]</span>
                  <span className="event-log-type">{item.type}</span>
                  <span className="event-log-msg">{item.message}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}


function SectionIntro({ eyebrow, title, text }) { return <header className="section-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></header> }
function Stat({ label, value }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }
function Range({ label, value, max, step, display, onChange }) { return <label className="range-control"><span>{label}<b>{display}</b></span><input type="range" min="0" max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))}/></label> }
function Check({label,passed,value}) { return <div className={`validation-check ${passed?'passed':'failed'}`}><i><Icon name={passed?'check':'info'} size={14}/></i><span>{label}</span><b>{value}</b></div> }

export default function App() {
  const [tab, setTab] = useState('overview')
  const [config, setConfig] = useState(defaultConfig)
  const [result, setResult] = useState(() => runSimulation(defaultConfig))
  const [history, setHistory] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const run = () => {
    const next = runSimulation(config)
    setResult(next)
    setHistory((items) => [next, ...items].slice(0, 6))
  }

  const applyScenario = (key) => {
    const nextConfig = { ...config, ...scenarios[key], seed: config.seed + 1 }
    setConfig(nextConfig)
    const next = runSimulation(nextConfig)
    setResult(next)
    setHistory((items) => [next, ...items].slice(0, 6))
  }

  const selectedStrategies = useMemo(() => ['assignment','audit','consensus','reward','dispute'].map((category) => strategyOptions[category].find((item) => item.id === config[category])?.label), [config])

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand"><div><Icon name="mark" size={26}/></div><span><strong>P.O.U.S.</strong><small>PROOF OF USEFUL STAKE</small></span></div>
        <nav>{tabs.map(([id,label],index)=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><span>{String(index+1).padStart(2,'0')}</span>{label}</button>)}</nav>
        <div className="sidebar-foot"><span>Simulation status</span><strong><i/> Engine ready</strong><small>{result.config.nodeCount} nodes · seed {result.config.seed}</small></div>
      </aside>
      <main>
        <header className="topbar">
          <button className="sidebar-toggle" onClick={()=>setSidebarOpen((v)=>!v)} aria-label="Toggle sidebar">{sidebarOpen?'←':'→'}</button>
          <div className="breadcrumbs"><span>Proof of Useful Stake</span><Icon name="chevron" size={14}/><strong>{tabs.find(([id])=>id===tab)?.[1]}</strong></div>
          <div className="run-summary"><span>{selectedStrategies[1]}</span><span>{formatCompact(config.nodeCount)} nodes</span><button onClick={run}><Icon name="refresh"/> Re-run epoch</button></div>
        </header>
        <div className="workspace">
          {tab==='overview' && <Overview result={result} setTab={setTab}/>} {tab==='network' && <NetworkTab result={result}/>} {tab==='assignments' && <AssignmentsTab result={result} config={config}/>} {tab==='audits' && <AuditsTab result={result} config={config}/>} {tab==='disputes' && <DisputesTab result={result} config={config}/>} {tab==='rewards' && <RewardsTab result={result} config={config}/>} {tab==='validation' && <ValidationTab config={config} setConfig={setConfig} result={result} run={run} history={history}/>} {tab==='crypto' && <CryptoTab />}
        </div>
      </main>
      <aside className="control-rail">
        <div className="rail-head"><span className="eyebrow">LIVE CONFIGURATION</span><h2>Strategy stack</h2><p>Swap one module, then re-run the epoch.</p></div>
        <div className="strategy-stack"><StrategySelect label="Assignment" category="assignment" value={config.assignment} onChange={(v)=>setConfig({...config,assignment:v})}/><StrategySelect label="Audit" category="audit" value={config.audit} onChange={(v)=>setConfig({...config,audit:v})}/><StrategySelect label="Consensus" category="consensus" value={config.consensus} onChange={(v)=>setConfig({...config,consensus:v})}/><StrategySelect label="Reward" category="reward" value={config.reward} onChange={(v)=>setConfig({...config,reward:v})}/><StrategySelect label="Dispute" category="dispute" value={config.dispute} onChange={(v)=>setConfig({...config,dispute:v})}/></div>
        <div className="rail-section"><span>Network scale</span><label className="numeric-field"><input type="number" min="10" max="5000" value={config.nodeCount} onChange={(e)=>setConfig({...config,nodeCount:Number(e.target.value)})}/><small>nodes</small></label><Range label="Audit coverage" value={config.auditRate} max={0.4} step={0.01} display={formatPercent(config.auditRate)} onChange={(v)=>setConfig({...config,auditRate:v})}/><label className="numeric-field"><input type="number" min="3" max="31" step="2" value={config.committeeSize} onChange={(e)=>setConfig({...config,committeeSize:Number(e.target.value)})}/><small>committee</small></label></div>
        <div className="rail-section"><span>Scenario presets</span><div className="preset-grid">{Object.entries(scenarios).map(([key,item])=><button key={key} onClick={()=>applyScenario(key)}>{item.label}</button>)}</div></div>
        <button className="primary full-button" onClick={run}><Icon name="play"/> Run epoch</button>
      </aside>
    </div>
  )
}
