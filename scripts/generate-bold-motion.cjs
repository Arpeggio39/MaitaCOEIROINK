const fs = require('node:fs');
const path = require('node:path');
const duration = 8;
const tracks = {
  ParamAngleX: [0,-28,28,-25,25,0,22,-22,0],
  ParamAngleY: [0,20,-20,15,-15,20,-20,10,0],
  ParamAngleZ: [0,-25,25,-20,20,0,-22,22,0],
  ParamBodyAngleX: [0,-10,10,-9,9,0,8,-8,0],
  ParamBodyAngleY: [0,7,-7,8,-8,0,7,-7,0],
  ParamBodyAngleZ: [0,-10,10,-8,8,0,-10,10,0],
  ParamPositionX2: [0,-20,20,-15,15,0,20,-20,0],
  Param79: [0,1,-1,1,-1,1,-1,1,0], Param80: [0,-1,1,-1,1,-1,1,-1,0],
  Param83: [0,-1,1,-1,1,-1,1,-1,0], Param84: [0,1,-1,1,-1,1,-1,1,0],
  ParamEyeLOpen: [1,1,.2,1,.2,1,.2,1,1], ParamEyeROpen: [1,1,.2,1,.2,1,.2,1,1],
  ParamBrowLY: [0,.8,-.8,.8,-.8,0,.8,-.8,0], ParamBrowRY: [0,.8,-.8,.8,-.8,0,.8,-.8,0],
  ParamMouthForm: [.8,.8,.8,.8,.8,.8,.8,.8,.8],
  ParamMouthOpenY: [.9,.9,.9,.9,.9,.9,.9,.9,.9],
};
const Curves = Object.entries(tracks).map(([Id, values]) => {
  const Segments = [0, values[0]];
  for (let i = 1; i < values.length; i++) Segments.push(1, i-2/3, values[i-1], i-1/3, values[i], i, values[i]);
  return { Target: 'Parameter', Id, Segments };
});
const motion = { Version: 3, Meta: { Duration: duration, Fps: 30, Loop: true, AreBeziersRestricted: true, CurveCount: Curves.length, TotalSegmentCount: Curves.length*8, TotalPointCount: Curves.length*25 }, Curves };
const output = path.resolve(process.argv[2] || 'local-output/maita-bold.motion3.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(motion,null,2)+'\n');
console.log(output);
