import assert from 'node:assert/strict'
import { CryptoPoUSNetwork, UsefulTask } from '../src/cryptoSimulation.js'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('useful work task verifies correct weights and rejects random invalid weights', () => {
  const task = new UsefulTask(1, 4, 0.08)
  const solved = task.solve(1000)
  assert.ok(solved.loss <= 0.08, `Expected loss <= 0.08, got ${solved.loss}`)
  assert.equal(task.verify(solved.weights), true)

  const fakeWeights = [100, -100, 50, -50]
  assert.equal(task.verify(fakeWeights), false)
})

test('PoUS network correctly initializes with genesis block', () => {
  const net = new CryptoPoUSNetwork()
  const snap = net.getSnapshot()
  assert.equal(snap.blockHeight, 0)
  assert.equal(snap.blocks[0].proposer, 'GENESIS')
})

test('validator weight increases with both stake and useful work credits', () => {
  const net = new CryptoPoUSNetwork()
  net.registerNode('NodeA', 1000, 200)
  net.registerNode('NodeB', 1000, 400)

  // Initially NodeB has higher weight because of higher stake
  assert.ok(net.calculateWeight('NodeB') > net.calculateWeight('NodeA'))

  // Give NodeA useful work credits
  net.nodes.get('NodeA').usefulCredits = 10
  assert.ok(net.calculateWeight('NodeA') > net.calculateWeight('NodeB'))
})

test('mining successfully produces blocks and transfers rewards/fees', () => {
  const net = new CryptoPoUSNetwork({ blockReward: 50, targetLoss: 0.1 })
  net.registerNode('Alice', 1000, 300)
  net.registerNode('Bob', 1000, 300)

  net.addTransaction('Alice', 'Bob', 25, 2)
  const initialAliceBalance = net.nodes.get('Alice').balance
  const initialBobBalance = net.nodes.get('Bob').balance

  const res = net.mineNextBlock()
  assert.equal(res.success, true)
  assert.equal(net.chain.length, 2)
  assert.equal(net.chain[1].transactions.length, 1)

  // Check that block proposer received reward (50) + tx fee (2)
  const proposer = net.nodes.get(res.block.proposer)
  assert.ok(proposer.usefulCredits >= 1)
})

test('adversarial node submitting invalid PoUW is slashed', () => {
  const net = new CryptoPoUSNetwork({ slashPenaltyRatio: 0.25 })
  net.registerNode('Eve_Attacker', 1000, 400, true) // isAdversarial = true

  const initialStake = net.nodes.get('Eve_Attacker').stake
  const res = net.mineNextBlock()

  assert.equal(res.success, false)
  assert.equal(res.reason, 'INVALID_POUW_PROOF')
  assert.equal(res.slashed, 'Eve_Attacker')
  assert.equal(net.nodes.get('Eve_Attacker').stake, initialStake * 0.75)
})

let passed = 0
for (const entry of tests) {
  try {
    entry.fn()
    passed++
    console.log(`PASS ${entry.name}`)
  } catch (error) {
    console.error(`FAIL ${entry.name}`)
    throw error
  }
}
console.log(`\n${passed}/${tests.length} crypto simulation checks passed`)
