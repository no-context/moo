
const Benchmark = require('benchmark')

const BrickFace = require('../brickface')

let suite = new Benchmark.Suite()


const python = require('./python')
let pythonFile = python.pythonFile
let tokenizePython = python.tokenize

suite.add('python', function() {
  tokenizePython(pythonFile, () => {})
})

let pythonFile10 = ''
for (var i = 10; i--; ) { pythonFile10 += pythonFile }
suite.add('python x10', function() {
  tokenizePython(pythonFile10, () => {})
})


suite.on('cycle', function(event) {
    var bench = event.target;
    if (bench.error) {
        console.log('  ✘ ', bench.name)
        console.log(bench.error.stack)
        console.log('')
    } else {
        console.log('  ✔ ' + bench)
    }
})
.on('complete', function() {
    // TODO: report geometric mean.
})
.run()


