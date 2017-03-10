
const Benchmark = require('benchmark')

const BrickFace = require('../brickface')

let suite = new Benchmark.Suite()


const python = require('./python')
let pythonFile = python.pythonFile
let tokenizePython = python.tokenize

suite.add('python', function() {
  let readline = BrickFace.stringReadlines(pythonFile);
  tokenizePython(readline, () => {})
})

let pythonFile10 = ''
for (var i = 10; i--; ) { pythonFile10 += pythonFile }
suite.add('python x10', function() {
  let readline = BrickFace.stringReadlines(pythonFile10);
  tokenizePython(readline, () => {})
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

