import assert from 'node:assert/strict'
import { defaultConfig, detectionProbability, runSimulation } from '../src/simulation.js'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('detection probability increases with more checks', () => {
  assert.ok(detectionProbability(0.2, 30) > detectionProbability(0.2, 10))
})

test('simulation is deterministic for the same seed', () => {
  const first = runSimulation(defaultConfig)
  const second = runSimulation(defaultConfig)
  assert.deepEqual(first.metrics, second.metrics)
})

test('all simulated work and rewards remain bounded', () => {
  const result = runSimulation({ ...defaultConfig, nodeCount: 1000 })
  assert.equal(result.nodes.length, 1000)
  assert.ok(result.metrics.acceptedWork <= result.metrics.completedWork)
  const rewards = result.nodes.reduce((sum, node) => sum + node.reward, 0)
  assert.ok(Math.abs(rewards - defaultConfig.rewardPool) < 0.001)
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
console.log(`\n${passed}/${tests.length} simulation checks passed`)
