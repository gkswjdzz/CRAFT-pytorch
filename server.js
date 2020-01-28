var express = require("express"),
  cors = require("cors"),
  Busboy = require("busboy"),
  fs = require("fs"),
  uuidv4 = require('uuid/v4'),
  path = require('path')
const { spawn } = require('child_process')

var app = express()
app.use(express.json())
app.use(express.urlencoded({extended: false}))
app.use(cors({
  origin: 'https://ainize.ai',
}))

const repo_dir = '.'

const model_names = ['craft_mlt_25k', 'craft_ic15_20k', 'craft_refiner_CTW1500']
const params = ['zip', 'text', 'image']

//return [filename uploaded, model_name]
function busboyFunc(req, res) {
  return new Promise((resolve, reject) => {
    let fileuploaded = true
    let temp = new Map()
    let busboy = new Busboy({ headers: req.headers })
    const uuid4 = uuidv4()
    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      if (filename === "") {
        fileuploaded = false
      }
      file.pipe(fs.createWriteStream(__dirname + '/data/' + uuid4 + '.jpg'))
    })

    busboy.on("field", (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) =>
      temp.set(fieldname, val)
    )

    busboy.on("finish", () => {
      if (!fileuploaded) {
        res.writeHead(400)
        res.end()
        return
      }
      console.log('busboy function resolve')
      resolve([uuid4, temp.get('model')])
    })
    
    req.pipe(busboy)
  }).then(data => {
    console.log('uuid is ' + data[0] + ' model is ' + data[1])
    return [__dirname + '/data/' + data[0] + '.jpg', data[1]]
  })
}

app.post('/:format', async (req, res) => {
  const format = req.params.format
  console.log(format)
  
  if(!params.includes(format)){
    console.log('param error!')
    res.end()
    return
  }

  const [inputname, model] = await busboyFunc(req, res)
  
  console.log(model)
  if(!(model_names.includes(model))){
      //TODO: res error handling
      console.log('model_name error!')
      res.end()
      return
  }
  
  //[--trained_model, --text_threshold, --low_text, --link_threshold, --cuda, --canvas_size, --mag_ratio, --poly, --show_time, --test-folder, --refine, --refiner_model]
  const configs = [model + '.pth', 0.7, 0.4, 0.4, 'False', 1280, 1.5, 'False', 'False', inputname, 'False', 'weights/craft_refiner_CTW1500.pth']

  const code = await runPython(configs)
  console.log('end run python')
  
  //<TODO> if code check
  if(code != 0){
    console.log(code)
    res.end()
    return
  }

  const split = inputname.split('/')
  const filename = (path.dirname(inputname) + '/res_' + split[split.length - 1]).split('.')[0]
  const maskOutput = filename + '_mask.jpg'
  const txtOutput = filename + '.txt'
  const jpgOutput =  filename + '.jpg'

  if(format == 'zip'){
    const zip = spawn('zip', ['-rj', '-', maskOutput, txtOutput, jpgOutput])
      // Keep writing stdout to res
    res.contentType('zip')
    zip.stdout.on('data', data => res.write(data))
    zip.stderr.on('data', data => console.log('zip stderr: ' + data))

    // End the response on zip exit
    zip.on('exit', code => {
      if(code !== 0) res.statusCode = 500
      console.log('zip process exited with code ' + code)
      res.end()
    })
  }else if(format == 'text'){
    let txt = spawn('cat', [txtOutput])
    let result = ''
      // Keep writing stdout to res
    res.contentType('json')
    
    txt.stdout.on('data', data => result += data)
    txt.stderr.on('data', data => 
      console.log('txt stderr: ' + data)
    )

    // End the response on txt exit
    txt.on('exit', (code) => {
      if(code !== 0) {
        res.statusCode = 500
        console.log('zip process exited with code ' + code)
        res.end()
      } else {
        quadrangles = result.split('\r\n')
        
        let ret = {}
        for(let i = 0; i < quadrangles.length; i++){
          let quadrangle = quadrangles[i].split(',')
          temp = {}
          if(quadrangle[0] == '')
            break
          temp['lu'] = [quadrangle[0], quadrangle[1]]
          temp['ru'] = [quadrangle[2], quadrangle[3]]
          temp['rd'] = [quadrangle[4], quadrangle[5]]
          temp['ld'] = [quadrangle[6], quadrangle[7]]
          ret[i] = temp
        }
        console.log(ret)
        res.json(ret)
      }
    })
  }else if(format =='image'){
    const img = fs.createReadStream(jpgOutput)
    img.on('open', () => {
      res.set('Content-Type', 'image/png')
      img.pipe(res)
    })
    img.on('exit', (code) =>
      console.log('image spawn exit : ' + code)
    )
  }else{
    console.log('sorry ! support only zip format')
    res.end()
    return
  }
})
app.listen(80, () => {
  console.log("server connect")
})

//run python except densepose
runPython = (configs) => {
  return new Promise((resolve, reject) => {
    let conf = [
      repo_dir + "/test.py",
      '--trained_model', configs[0],
      '--text_threshold', configs[1], 
      '--low_text', configs[2], 
      '--link_threshold', configs[3], 
      '--cuda', 'False', // not yet support cuda //configs[4], 
      '--canvas_size', configs[5], 
      '--mag_ratio', configs[6],
      //'--poly', configs[7], 
      //'--show_time', configs[8], 
      '--image_path', configs[9], 
      //'--refine', configs[10], 
      //'--refiner_model', configs[11], 
    ]
    const pyProg = spawn('python', conf)
    pyProg.stderr.on('data', (data) => {
      console.log(data.toString())
      resolve(data.toString())
    })
    pyProg.on('exit', (code) =>{
      console.log('pyProg exit code : ' + code)
      resolve(code)
    })
  })
}