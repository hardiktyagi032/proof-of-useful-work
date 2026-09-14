/**
 * Proof of Useful Stake (PoUS) Cryptocurrency Engine
 * Simulates a blockchain where block proposer selection and rewards combine
 * economic stake with verifiable computational work (PoUW).
 */

function simpleSha256(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

export class UsefulTask {
  constructor(taskId, size = 4, targetLoss = 0.05) {
    this.taskId = taskId
    this.size = size
    this.targetLoss = targetLoss

    let seed = taskId * 1337 + 7
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    this.matrixA = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0.5 + rng() * 1.5)
    )
    this.targetB = Array.from({ length: size }, () => 1.0 + rng() * 3.0)
  }

  evaluate(weights) {
    if (!weights || weights.length !== this.size) return Infinity
    let totalError = 0
    for (let i = 0; i < this.size; i++) {
      let dot = 0
      for (let j = 0; j < this.size; j++) {
        dot += this.matrixA[i][j] * weights[j]
      }
      totalError += (dot - this.targetB[i]) ** 2
    }
    return totalError / this.size
  }

  verify(weights) {
    return this.evaluate(weights) <= this.targetLoss
  }

  solve() {
    const n = this.size
    const M = Array.from({ length: n }, (_, i) => [...this.matrixA[i], this.targetB[i]])

    for (let i = 0; i < n; i++) {
      let pivot = i
      for (let r = i + 1; r < n; r++) {
        if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r
      }
      const temp = M[i]
      M[i] = M[pivot]
      M[pivot] = temp

      if (Math.abs(M[i][i]) < 1e-9) continue
      const diag = M[i][i]
      for (let c = i; c <= n; c++) M[i][c] /= diag
      for (let r = 0; r < n; r++) {
        if (r !== i) {
          const factor = M[r][i]
          for (let c = i; c <= n; c++) M[r][c] -= factor * M[i][c]
        }
      }
    }

    const weights = Array.from({ length: n }, (_, i) => M[i][n])
    const finalLoss = this.evaluate(weights)
    return { weights, loss: finalLoss, valid: finalLoss <= this.targetLoss }
  }
}

export class CryptoPoUSNetwork {
  constructor(options = {}) {
    this.stakeWeightAlpha = options.stakeWeightAlpha ?? 0.6
    this.workWeightBeta = options.workWeightBeta ?? 0.4
    this.blockReward = options.blockReward ?? 50
    this.slashPenaltyRatio = options.slashPenaltyRatio ?? 0.2
    this.taskSize = options.taskSize ?? 4
    this.targetLoss = options.targetLoss ?? 0.06

    this.nodes = new Map()
    this.chain = []
    this.mempool = []
    this.currentTaskId = 1
    this.currentTask = new UsefulTask(this.currentTaskId, this.taskSize, this.targetLoss)
    this.eventLog = []

    this._initGenesis()
  }

  _log(type, message, details = {}) {
    this.eventLog.unshift({
      id: this.eventLog.length + 1,
      timestamp: Date.now(),
      type,
      message,
      details,
    })
    if (this.eventLog.length > 200) this.eventLog.pop()
  }

  _initGenesis() {
    const genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      previousHash: '0'.repeat(32),
      proposer: 'GENESIS',
      transactions: [],
      usefulProof: {
        taskId: 0,
        loss: 0,
        verified: true,
      },
      hash: simpleSha256('GENESIS_BLOCK_ROOT'),
    }
    this.chain.push(genesisBlock)
  }

  registerNode(id, initialBalance = 1000, stake = 200, isAdversarial = false) {
    if (stake > initialBalance) {
      throw new Error(`Stake (${stake}) cannot exceed balance (${initialBalance})`)
    }
    this.nodes.set(id, {
      id,
      balance: initialBalance - stake,
      stake,
      usefulCredits: 0,
      totalBlocksProposed: 0,
      slashedCount: 0,
      isAdversarial,
    })
    this._log('NODE_JOINED', `Node ${id} registered with ${stake} stake and ${initialBalance - stake} liquid balance`)
  }

  calculateWeight(nodeId) {
    const node = this.nodes.get(nodeId)
    if (!node || node.stake <= 0) return 0
    return Math.pow(node.stake, this.stakeWeightAlpha) * Math.pow(node.usefulCredits + 1, this.workWeightBeta)
  }

  selectProposer(rngFn = Math.random) {
    const activeNodes = Array.from(this.nodes.values()).filter((n) => n.stake > 0)
    if (activeNodes.length === 0) return null

    const weights = activeNodes.map((n) => ({ id: n.id, weight: this.calculateWeight(n.id) }))
    const totalWeight = weights.reduce((acc, w) => acc + w.weight, 0)
    if (totalWeight <= 0) return activeNodes[0].id

    let pick = rngFn() * totalWeight
    for (const item of weights) {
      if (pick <= item.weight) return item.id
      pick -= item.weight
    }
    return weights[weights.length - 1].id
  }

  addTransaction(from, to, amount, fee = 1) {
    const sender = this.nodes.get(from)
    if (!sender) throw new Error(`Sender ${from} not found`)
    if (!this.nodes.has(to)) throw new Error(`Recipient ${to} not found`)
    if (sender.balance < amount + fee) throw new Error(`Insufficient funds: ${sender.balance} < ${amount + fee}`)

    sender.balance -= (amount + fee)
    const tx = {
      id: simpleSha256(`${from}->${to}:${amount}:${Date.now()}:${Math.random()}`),
      from,
      to,
      amount,
      fee,
      timestamp: Date.now(),
    }
    this.mempool.push(tx)
    this._log('TX_SUBMITTED', `Tx ${tx.id.slice(0, 6)}: ${from} sent ${amount} to ${to}`, tx)
    return tx
  }

  mineNextBlock(rngFn = Math.random) {
    const proposerId = this.selectProposer(rngFn)
    if (!proposerId) {
      this._log('MINE_FAILED', 'No eligible proposers with positive stake')
      return null
    }

    const proposer = this.nodes.get(proposerId)
    const isMalicious = proposer.isAdversarial

    let solution
    if (isMalicious) {
      solution = { weights: [999, 999, 999, 999], loss: 888.8, valid: false }
    } else {
      solution = this.currentTask.solve(250, 0.05)
    }

    const verified = this.currentTask.verify(solution.weights)

    if (!verified) {
      const penalty = Math.min(proposer.stake, proposer.stake * this.slashPenaltyRatio)
      proposer.stake -= penalty
      proposer.slashedCount += 1
      this._log('SLASH_EVENT', `Node ${proposerId} proposed invalid PoUW! Slashed ${penalty.toFixed(1)} stake`, {
        proposerId,
        penalty,
        remainingStake: proposer.stake,
      })
      return { success: false, reason: 'INVALID_POUW_PROOF', slashed: proposerId, penalty }
    }

    const txsToInclude = this.mempool.splice(0, 10)
    let totalFees = 0
    for (const tx of txsToInclude) {
      const recipient = this.nodes.get(tx.to)
      if (recipient) recipient.balance += tx.amount
      totalFees += tx.fee
    }

    const totalPayout = this.blockReward + totalFees
    proposer.balance += totalPayout
    proposer.usefulCredits += 1
    proposer.totalBlocksProposed += 1

    const previousBlock = this.chain[this.chain.length - 1]
    const block = {
      index: this.chain.length,
      timestamp: Date.now(),
      previousHash: previousBlock.hash,
      proposer: proposerId,
      transactions: txsToInclude,
      usefulProof: {
        taskId: this.currentTask.taskId,
        loss: Number(solution.loss.toFixed(5)),
        verified: true,
      },
      hash: simpleSha256(`${this.chain.length}:${previousBlock.hash}:${proposerId}:${solution.loss}`),
    }

    this.chain.push(block)
    this.currentTaskId += 1
    this.currentTask = new UsefulTask(this.currentTaskId, this.taskSize, this.targetLoss)

    this._log('BLOCK_MINTED', `Block #${block.index} minted by ${proposerId}. Reward: ${totalPayout} tokens.`, {
      blockIndex: block.index,
      proposer: proposerId,
      txCount: txsToInclude.length,
      usefulCredits: proposer.usefulCredits,
    })

    return { success: true, block }
  }

  getSnapshot() {
    return {
      blockHeight: this.chain.length - 1,
      blocks: [...this.chain].reverse().slice(0, 15),
      nodes: Array.from(this.nodes.values()).map((n) => ({
        ...n,
        weight: Number(this.calculateWeight(n.id).toFixed(2)),
      })),
      pendingTxs: [...this.mempool],
      currentTaskId: this.currentTaskId,
      targetLoss: this.targetLoss,
      eventLog: [...this.eventLog],
    }
  }
}
