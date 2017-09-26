const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;
const AWS = require('aws-sdk');
const lawgs = require('lawgs');
const config = require('./config.json');
const autoscaling = new AWS.AutoScaling(config);
lawgs.config({
	aws:config
});
const logger = lawgs.getOrCreate('ASG');
var lifeCycleParams = {};
const sqs = new AWS.SQS({region:'us-east-1'}); 
const sqsReader = require('sqs-consumer');
/*Worker Process should poll the SQS and read messages.After reading the message it should send a message to Master to signal autoscaling to terminate
 instance*/
var messageHandler = function(message,done){
	//Do some work with the message
	console.log("processing the message");
	console.log(`worker process id ${process.pid}`);
	var json = JSON.parse(message.Body);
	console.log(json);
	
	if(json.hasOwnProperty('EC2InstanceId')||(json.hasOwnProperty('Event')&&json['Event']==="autoscaling:TEST_NOTIFICATION")){
		if(json.hasOwnProperty('Event')&&json['Event']==="autoscaling:TEST_NOTIFICATION"){
			console.log("Got a test message from SQS. Ignore!!!");
			return done();
		}else{
			if(true){
			// Check wheather the instance-id matches with the current instance
				
			}
			console.log("Got termination event");
			process.send({cmd:"Terminate",message:json});
			return done();		
		}		
	}
	return done("Not processing");
}
if (cluster.isMaster) {
	var timeout;
	var _termiationHandler = function(msg){
		logger.log('sample',"Got an Lifecycle hook event from SQS. Will finish my JOB ASAP");
		logger.log('sample',"Finishing my job in 10 minutes");
		logger.log('sample',"Wil signal to ASG to complete termination isntance after 10 mins.");
		lifeCycleParams = {
			AutoScalingGroupName: msg.AutoScalingGroupName,
			LifecycleActionResult: "CONTINUE",
			LifecycleActionToken: msg.LifecycleActionToken,
			LifecycleHookName:msg.LifecycleHookName
		}
		var func1 = function(){
			autoscaling.completeLifecycleAction(lifeCycleParams,function(err,data){
				if (err) {console.log(err, err.stack);} // an error occurred
				else {
					console.log(data);
					logger.log('sample','Got the termination response from ASG');
					logger.log('sample',data);
				}           // successful response
				
			});
		}
		setTimeout(func1,360000)
	}
	console.log(`Master process id ${process.pid}:`);
	const worker = cluster.fork();
	worker.on('message',function(msg){
		console.log("Got a message from Worker");
		var parsedMsg = (typeof msg === "object")? msg: JSON.parse(msg);
		console.log(typeof parsedMsg)
		console.log(parsedMsg);
		if(parsedMsg.hasOwnProperty('cmd') && parsedMsg['cmd']==="Terminate"){
			logger.log('sample',parsedMsg.message);
			_termiationHandler(parsedMsg.message);
			worker.disconnect();
		}
		//logger.log('sample',parsedMsg);
	});
	worker.on('disconnect',function(){
		console.log("Got disconnect event from Master");
		setTimeout(() => {
				worker.kill();
			}, 2000);		
	})
}
//Worker Process will Poll the SQS
else if (cluster.isWorker){
	console.log(`worker process id ${process.pid}`);
	const app = sqsReader.create({
		queueUrl: 'https://sqs.us-east-1.amazonaws.com/184665364105/ECS-QUEUE',
		handleMessage: messageHandler,
		region:'us-east-1'
	});
	app.on('error', function (err){
		console.log(err.message);
	});
    app.start();
}
