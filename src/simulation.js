export const strategyOptions = {
  assignment: [
    { id: 'capacity', label: 'Capacity weighted', description: 'Work follows declared compute, limited by collateral.' },
    { id: 'uniform', label: 'Uniform random', description: 'Every eligible worker receives an equal expected share.' },
    { id: 'stake-cap', label: 'Stake-capped', description: 'Capacity allocation is capped by a stake-to-work ratio.' },
  ],
  audit: [
    { id: 'hidden-overlap', label: 'Hidden overlap', description: 'Pair-specific overlaps are selected after commitment.' },
    { id: 'fixed-overlap', label: 'Fixed overlap', description: 'Assignments contain known redundant audit shards.' },
    { id: 'full-zk', label: 'Universal zkPoT', description: 'Every submission must provide a proof of training.' },
  ],
  consensus: [
    { id: 'stake-bft', label: 'Stake BFT', description: 'A stake-selected committee finalizes accepted work.' },
    { id: 'quality-bft', label: 'Quality-weighted BFT', description: 'Verified contribution history influences voting weight.' },
    { id: 'simple-majority', label: 'Simple majority', description: 'A baseline honest-majority committee.' },
  ],
  reward: [
    { id: 'verified-work', label: 'Verified work', description: 'Rewards follow accepted canonical training units.' },
    { id: 'quality-adjusted', label: 'Quality adjusted', description: 'Accepted work is multiplied by a bounded utility score.' },
    { id: 'equal', label: 'Equal split', description: 'All accepted workers share rewards equally.' },
  ],
  dispute: [
    { id: 'merkle-zk', label: 'Merkle + ZK', description: 'Bisect the trace, then prove the disputed transition.' },
    { id: 'recompute', label: 'Full recompute', description: 'The committee replays the disputed assignment.' },
    { id: 'quorum-only', label: 'Quorum only', description: 'The audit committee majority decides without a proof.' },
  ],
}

export const scenarios = {
  baseline: { label: 'Honest baseline', maliciousRate: 0.02, collusionRate: 0, dropoutRate: 0.03, corruptionRate: 0.1 },
  poisoning: { label: 'Poisoning wave', maliciousRate: 0.25, collusionRate: 0.12, dropoutRate: 0.04, corruptionRate: 0.35 },
  cartel: { label: 'Colluding cartel', maliciousRate: 0.34, collusionRate: 0.75, dropoutRate: 0.02, corruptionRate: 0.2 },
  unstable: { label: 'Unstable network', maliciousRate: 0.08, collusionRate: 0.05, dropoutRate: 0.28, corruptionRate: 0.15 },
}

export const defaultConfig = {
  nodeCount: 500,
  workUnits: 100000,
  auditRate: 0.08,
  committeeSize: 7,
  stakeRatio: 0.35,
  rewardPool: 10000,
  maliciousRate: 0.12,
  collusionRate: 0.08,
  dropoutRate: 0.05,
  corruptionRate: 0.2,
  seed: 2601,
  assignment: 'stake-cap',
  audit: 'hidden-overlap',
  consensus: 'stake-bft',
  reward: 'verified-work',
  dispute: 'merkle-zk',
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value, digits = 1) => Number(value.toFixed(digits))

export function detectionProbability(corruptionRate, checks, auditStrategy = 'hidden-overlap') {
  const effectiveChecks = auditStrategy === 'fixed-overlap' ? checks * 0.55 : checks
  if (auditStrategy === 'full-zk') return 1 - 2 ** -64
  return 1 - (1 - corruptionRate) ** Math.max(0, effectiveChecks)
}

export function runSimulation(config) {
  const rng = mulberry32(Number(config.seed) || 1)
  const count = clamp(Math.round(config.nodeCount), 10, 5000)
  const committeeSize = clamp(Math.round(config.committeeSize), 3, 31)
  const quorum = config.consensus === 'simple-majority'
    ? Math.floor(committeeSize / 2) + 1
    : Math.floor((committeeSize * 2) / 3) + 1
  const auditMultiplier = config.audit === 'full-zk' ? 1 : config.auditRate
  const checksPerNode = Math.max(1, Math.round((config.workUnits / count) * auditMultiplier))
  const baseDetection = detectionProbability(config.corruptionRate, checksPerNode, config.audit)

  const rawNodes = Array.from({ length: count }, (_, index) => {
    const capacity = 0.35 + rng() * 2.4
    const stake = 50 + rng() * 950
    const malicious = rng() < config.maliciousRate
    const colluding = malicious && rng() < config.collusionRate
    const dropped = rng() < config.dropoutRate
    let weight = config.assignment === 'uniform' ? 1 : capacity
    if (config.assignment === 'stake-cap') weight = Math.min(capacity, 0.35 + stake / 520)
    return { id: index + 1, capacity, stake, malicious, colluding, dropped, weight }
  })

  const totalWeight = rawNodes.reduce((sum, node) => sum + node.weight, 0)
  let detectedMalicious = 0
  let escapedMalicious = 0
  let disputes = 0

  const nodes = rawNodes.map((node) => {
    const assigned = Math.max(1, Math.round((node.weight / totalWeight) * config.workUnits))
    const completed = node.dropped ? Math.round(assigned * rng() * 0.45) : assigned
    let detected = false
    if (node.malicious && !node.dropped) {
      let chance = baseDetection
      if (node.colluding) chance *= config.audit === 'hidden-overlap' ? 0.82 : 0.52
      if (config.consensus === 'quality-bft') chance = clamp(chance + 0.035, 0, 1)
      detected = rng() < chance
      detected ? detectedMalicious++ : escapedMalicious++
      if (detected) disputes++
    }
    const honestAccepted = node.malicious && !detected ? completed * (1 - config.corruptionRate) : completed
    const accepted = node.dropped ? completed : detected ? 0 : Math.round(honestAccepted)
    const quality = clamp(0.72 + rng() * 0.28 - (node.malicious && !detected ? 0.3 : 0), 0, 1)
    let rewardWeight = config.reward === 'equal' ? Number(accepted > 0) : accepted
    if (config.reward === 'quality-adjusted') rewardWeight *= quality
    const status = node.dropped ? 'dropped' : detected ? 'disputed' : node.malicious ? 'escaped' : 'verified'
    return { ...node, assigned, completed, accepted, quality, rewardWeight, detected, status }
  })

  const totalRewardWeight = nodes.reduce((sum, node) => sum + node.rewardWeight, 0) || 1
  nodes.forEach((node) => {
    node.reward = (node.rewardWeight / totalRewardWeight) * config.rewardPool
  })

  const acceptedWork = nodes.reduce((sum, node) => sum + node.accepted, 0)
  const completedWork = nodes.reduce((sum, node) => sum + node.completed, 0)
  const maliciousTotal = nodes.filter((node) => node.malicious && !node.dropped).length
  const dropoutTotal = nodes.filter((node) => node.dropped).length
  const auditWork = config.audit === 'full-zk'
    ? completedWork
    : Math.round(completedWork * config.auditRate * (committeeSize - 1))
  const zkDisputes = config.dispute === 'merkle-zk' ? disputes : 0
  const disputeCost = config.dispute === 'recompute' ? disputes * checksPerNode * 12 : disputes * Math.log2(Math.max(2, checksPerNode))
  const consensusSafety = clamp(1 - (config.maliciousRate / (config.consensus === 'simple-majority' ? 0.5 : 0.334)) ** 2 * 0.25, 0, 1)
  const verificationLatency = 110 + committeeSize * 18 + auditWork / 900 + disputeCost * 2.5
  const rewardGiniProxy = config.reward === 'equal' ? 0.04 : config.assignment === 'uniform' ? 0.18 : 0.31

  const metrics = {
    detectionRate: maliciousTotal ? detectedMalicious / maliciousTotal : 1,
    escapedMalicious,
    detectedMalicious,
    maliciousTotal,
    dropoutTotal,
    acceptedWork,
    completedWork,
    usefulRatio: completedWork ? acceptedWork / (completedWork + auditWork) : 0,
    redundantWork: auditWork,
    auditOverhead: completedWork ? auditWork / completedWork : 0,
    verificationLatency,
    disputes,
    zkDisputes,
    quorum,
    consensusSafety,
    rewardGiniProxy,
    checksPerNode,
  }

  const rounds = Array.from({ length: 16 }, (_, i) => {
    const progress = (i + 1) / 16
    const noise = (rng() - 0.5) * 0.035
    const attackDrag = config.maliciousRate * (1 - metrics.detectionRate) * 0.42
    return {
      round: i + 1,
      accuracy: clamp(0.48 + 0.44 * (1 - Math.exp(-3.2 * progress)) - attackDrag + noise, 0.35, 0.96),
      detection: clamp(metrics.detectionRate - 0.1 + progress * 0.1 + noise, 0, 1),
      latency: verificationLatency * (0.82 + rng() * 0.36),
    }
  })

  return { config: { ...config, committeeSize, nodeCount: count }, nodes, metrics, rounds, timestamp: Date.now() }
}

export function formatCompact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}
