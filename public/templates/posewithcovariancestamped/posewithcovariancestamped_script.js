import { view } from '/vizanti/js/modules/view.js';
import { tf } from '/vizanti/js/modules/tf.js';
import { rosbridge } from '/vizanti/js/modules/rosbridge.js';
import { settings } from '/vizanti/js/modules/persistent.js';
import { Status } from '/vizanti/js/modules/status.js';

let topic = getTopic("{uniqueID}");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let listener = undefined;
let marker_topic = undefined;

let posemsg = undefined;
let frame = "";

const scaleSlider = document.getElementById('{uniqueID}_scale');
const scaleSliderValue = document.getElementById('{uniqueID}_scale_value');

scaleSlider.addEventListener('input', function () {
	scaleSliderValue.textContent = this.value;
});

scaleSlider.addEventListener('change', saveSettings);

const selectionbox = document.getElementById("{uniqueID}_topic");
const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d');

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	topic = loaded_data.topic;

	scaleSlider.value = loaded_data.scale;
	scaleSliderValue.textContent = scaleSlider.value;
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		topic: topic,
		scale: parseFloat(scaleSlider.value)
	}
	settings.save();
}

function drawMarkers(){

	function drawCircle(size){
		ctx.beginPath();
		ctx.arc(0, 0, size/2, 0, 2 * Math.PI, false);
		ctx.fill();
	}

	function drawArrow(size){
		const height = parseInt(size*2.0);
		const width = parseInt(size*0.1*0.6)+1;
		const tip = parseInt(size*0.24)+1;
		const tipwidth = parseInt(size*0.3*0.6)+1;

		ctx.beginPath();
		ctx.moveTo(0, -width);
		ctx.lineTo(height - tip, -width);
		ctx.lineTo(height - tip, -tipwidth);
		ctx.lineTo(height, 0);
		ctx.lineTo(height - tip, tipwidth);
		ctx.lineTo(height - tip, width);
		ctx.lineTo(0, width);
		ctx.lineTo(0, -width);
		ctx.fill();
	}
	
	function drawCovariance(covariance, size) {
	  
		// Extract the variance values for X and Y.
		const varianceX = covariance[0];
		const varianceY = covariance[7];
	  
		// Compute the standard deviation, which will be the radius for our ellipse.
		const radiusX = Math.sqrt(varianceX) * size;
		const radiusY = Math.sqrt(varianceY) * size;
	  
		// Draw the ellipse. The factor of 3 is used to ensure that the 99.7% confidence interval is included.
		ctx.save();
		ctx.scale(1, -1);
		ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'; // Yellow, semi-transparent
		ctx.beginPath();
		ctx.ellipse(0, 0, 3 * radiusX, 3 * radiusY, 0, 0, 2 * Math.PI);
		ctx.fill();
		ctx.restore();
	}

	const unit = view.getMapUnitsInPixels(1.0);

	const wid = canvas.width;
    const hei = canvas.height;

	ctx.clearRect(0, 0, wid, hei);

	if(!posemsg)
		return;

	if(frame === tf.fixed_frame){

		const screenpos = view.fixedToScreen(posemsg);
		const scale = unit*parseFloat(scaleSlider.value);

		ctx.save();
		ctx.translate(screenpos.x, screenpos.y);
		ctx.scale(1, -1);

		if(!posemsg.rotation_invalid)
			ctx.rotate(posemsg.yaw);

		drawCovariance(posemsg.covariance, unit);

		ctx.fillStyle = "rgba(139, 0, 0, 0.9)";

		if(!posemsg.rotation_invalid){
			drawArrow(scale);
		}else{
			drawCircle(scale*0.4);
		}

		ctx.restore();
	}
}

//Topic
function connect(){

	if(topic == ""){
		status.setError("Empty topic.");
		return;
	}

	if(marker_topic !== undefined){
		marker_topic.unsubscribe(listener);
	}

	marker_topic = new ROSLIB.Topic({
		ros : rosbridge.ros,
		name : topic,
		messageType : 'geometry_msgs/PoseWithCovarianceStamped'
	});

	status.setWarn("No data received.");
	
	listener = marker_topic.subscribe((msg) => {
		
		if(!tf.absoluteTransforms[msg.header.frame_id]){
			status.setError("Required transform frame not found.");
			return;
		}

		frame = tf.fixed_frame;

		let q = msg.pose.pose.orientation;
		const rotation_invalid = q.x == 0 && q.y == 0 && q.z == 0 && q.w == 0

		if(rotation_invalid){
			status.setWarn("Received invalid rotation, defaulting to indentity quat.");
			q = new Quaternion();
		}

		const transformed = tf.transformPose(
			msg.header.frame_id, 
			tf.fixed_frame, 
			msg.pose.pose.position, 
			q
		);

		//Todo: transform covariance
	
		posemsg = {
			x: transformed.translation.x,
			y: transformed.translation.y,
			yaw: transformed.rotation.toEuler().h,
			rotation_invalid: rotation_invalid,
			covariance: msg.pose.covariance
		};
	
		drawMarkers();
		status.setOK();
	});

	saveSettings();
}

async function loadTopics(){
	let result = await rosbridge.get_topics("geometry_msgs/PoseWithCovarianceStamped");

	let topiclist = "";
	result.forEach(element => {
		topiclist += "<option value='"+element+"'>"+element+"</option>"
	});
	selectionbox.innerHTML = topiclist

	if(topic == "")
		topic = selectionbox.value;
	else{
		if(result.includes(topic)){
			selectionbox.value = topic;
		}else{
			topiclist += "<option value='"+topic+"'>"+topic+"</option>"
			selectionbox.innerHTML = topiclist
			selectionbox.value = topic;
		}
	}
	connect();
}

selectionbox.addEventListener("change", (event) => {
	topic = selectionbox.value;
	posemsg = undefined;
	connect();
});

selectionbox.addEventListener("click", (event) => {
	connect();
});

icon.addEventListener("click", (event) => {
	loadTopics();
});

loadTopics();

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawMarkers();
}

window.addEventListener("tf_changed", drawMarkers);
window.addEventListener("view_changed", drawMarkers);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("MarkerArray Widget Loaded {uniqueID}")

