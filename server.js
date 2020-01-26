var express = require("express"),
  cors = require("cors"),
  Busboy = require("busboy"),
  fs = require("fs"),
  inspect = require("util").inspect,
  uuidv4 = require('uuid/v4');
const { spawn } = require('child_process');

var app = express();
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cors({
  origin: 'https://ainize.ai',
}));

var repo_dir = '.';

const model_names = ['craft_mlt_25k', 'craft_ic15_20k', 'craft_refiner_CTW1500']
const params = ['zip', 'text', 'image']

//return [filename uploaded, model_name]
function busboyFunc(req, res) {
  return new Promise((resolve, reject) => {
    let fileuploaded = true;
    let model = true;
    let temp = new Map()
    var busboy = new Busboy({ headers: req.headers });
    uuid4 = uuidv4();
    busboy.on("file", function(fieldname, file, filename, encoding, mimetype) {
      if (filename === "") {
        fileuploaded = false;
      }
      file.pipe(fs.createWriteStream(__dirname + '/data/' + uuid4 + '.jpg'));
    });

    busboy.on("field", function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      temp.set(fieldname, val)
    });

    busboy.on("finish", function() {
      if (!fileuploaded) {
        res.writeHead(400);
        res.end();
        return;
      }
      console.log('busboy function resolve');
      resolve([uuid4, temp.get('model')]);
    });
    
    req.pipe(busboy);
  }).then(function(data){
    console.log('uuid is ' + data[0] + ' model is ' + data[1])
    return [__dirname + '/data/' + data[0] + '.jpg', data[1]]
  })
}

app.post('/textdetect/:format', async (req, res) => {
  format = req.params.format
  console.log(format)
  
  if(!params.includes(format)){
    console.log('param error!')
    res.end()
    return
  }

  const [inputname, model] = await busboyFunc(req, res);
  
  console.log(model)
  if(!(model_names.includes(model))){
      //TODO: res error handling
      console.log('model_name error!')
      res.end()
      return
  }
  //[--trained_model, --text_threshold, --low_text, --link_threshold, --cuda, --canvas_size, --mag_ratio, --poly, --show_time, --test-folder, --refine, --refiner_model]
  //configs = [model + '.pth', 0.7, 0.4, 0.4, 'False', 1280, 1.5, 'False', 'False', __dirname + '/data/', 'False', 'weights/craft_refiner_CTW1500.pth']
  configs = [model + '.pth', 0.7, 0.4, 0.4, 'False', 1280, 1.5, 'False', 'False', inputname, 'False', 'weights/craft_refiner_CTW1500.pth']

  code = await runPython(configs)
  console.log('end run python')
  
  //<TODO> if code check
  if(code != 0){
    console.log(code)
    res.end()
    return
  }
  filename = inputname.split('.')[0]

  maskOutput = filename + '_mask.jpg'
  txtOutput = filename + '.txt'
  jpgOutput =  filename + '.jpg'

  if(format != 'zip'){
    console.log('sorry ! support only zip format')
    res.end()
    return
  }

  var zip = spawn('zip', ['-rj', '-', maskOutput, txtOutput, jpgOutput]);
    // Keep writing stdout to res
  res.contentType('zip');
  
  zip.stdout.on('data', function (data) {
    res.write(data);
  });
  
  zip.stderr.on('data', function (data) {
    // Uncomment to see the files being added
    //console.log('zip stderr: ' + data);
  });

  // End the response on zip exit
  zip.on('exit', function (code) {
    if(code !== 0) {
        res.statusCode = 500;
        console.log('zip process exited with code ' + code);
        res.end();
    } else {
        res.end();
    }
  });
})
app.listen(80, () => {
  console.log("server connect");
});

//run python except densepose
runPython = (configs) => {
  return new Promise((resolve, reject) => {
    let ret = '';
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
    const pyProg = spawn('python', conf);
    pyProg.stderr.on('data', (data) => {
      console.log(data.toString())
      resolve(data.toString())
    })
    pyProg.on('exit', (code) =>
      resolve(code)
    )
  })
};