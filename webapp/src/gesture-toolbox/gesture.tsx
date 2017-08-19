/// <reference path="../../../built/pxtlib.d.ts"/>

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as data from "./../data";
import * as sui from "./../sui";
import * as pkg from "./../package";
import * as blocks from "./../blocks"
import * as hidbridge from "./../hidbridge";
import * as codecard from "./../codecard"
import Cloud = pxt.Cloud;

import * as Recorder from "./recorder";
import * as Types from "./types";
import * as Webcam from "./webcam";
import * as Viz from "./visualizations";
import * as Model from "./model";
import * as Indicator from "./indicator";
import { GraphCard } from "./graphcard";
import { streamerCode } from "./streamer";

const JSZip = require("jszip");
const FileSaver = require("file-saver");

type ISettingsProps = pxt.editor.ISettingsProps;
type IAppProps = pxt.editor.IAppProps;
type IAppState = pxt.editor.IAppState;
type IProjectView = pxt.editor.IProjectView;

export const gesturesContainerID: string = "gestures-container";
export const connectionIndicatorID: string = "connection-indicator";

interface GestureToolboxState {
    visible?: boolean;
    editGestureMode?: boolean;
    editDescriptionMode?: boolean;
    data?: Types.Gesture[];
    connected?: boolean;
}

export class GestureToolbox extends data.Component<ISettingsProps, GestureToolboxState> {
    private graphX: Viz.RealTimeGraph;
    private graphY: Viz.RealTimeGraph;
    private graphZ: Viz.RealTimeGraph;
    private recognitionOverlay: Viz.RecognitionOverlay;
    // private generatedCodeBlocks: string[];

    private graphInitialized: boolean;
    private webcamInitialized: boolean;
    private recorderInitialized: boolean;
    private shouldGenerateBlocks: boolean;

    private recorder: Recorder.Recorder;
    private curGestureIndex: number;
    private editedGestureName: string;

    private models: Model.SingleDTWCore[];

    lastConnectedTime: number;

    constructor(props: ISettingsProps) {
        super(props);

        // TODO: change this to load from outside
        let data: Types.Gesture[] = [];

        this.state = {
            visible: false,
            editGestureMode: false,
            editDescriptionMode: false,
            data: data,
            connected: false
        };

        this.lastConnectedTime = 0;
        this.models = [];
        // this.generatedCodeBlocks = [];

        this.graphInitialized = false;
        this.webcamInitialized = false;
        this.recorderInitialized = false;
        this.shouldGenerateBlocks = false;
    }

    generateBlocks() {
        // TODO: generate blocks here!
        let codeBlocks: string[] = [];

        for (let i = 0; i < this.models.length; i++) {
            if (this.models[i].isRunning())
                codeBlocks.push(this.models[i].GenerateBlock());
        }

        this.props.parent.updateFileAsync("custom.ts", Model.SingleDTWCore.GenerateNamespace(codeBlocks));

        this.shouldGenerateBlocks = false;
    }

    hide() {
        if (this.shouldGenerateBlocks) this.generateBlocks();

        this.setState({ visible: false, editGestureMode: false, editDescriptionMode: false });
        this.resetGraph();
        this.recorder.PauseWebcam();
    }


    show() {
        this.setState({ visible: true });

        const onSerialData = (buf: any, isErr: any) => {
            let strBuf: string = Util.fromUTF8(Util.uint8ArrayToString(buf));
            let newData = Recorder.parseString(strBuf);

            this.lastConnectedTime = Date.now();

            if (this.state.editGestureMode && this.state.connected) {
                if (newData.acc && this.graphZ.isInitialized()) {
                    this.graphX.update(newData.accVec.X);
                    this.graphY.update(newData.accVec.Y);
                    this.graphZ.update(newData.accVec.Z);

                    this.recorder.Feed(newData.accVec);

                    if (this.models[this.curGestureIndex].isRunning()) {
                        let match = this.models[this.curGestureIndex].Feed(newData.accVec);
                        if (match.classNum != 0) {
                            // console.log("RECOGNIZED GESTURE");
                            // TODO: add moving window that will show it has recognized something...
                            // in particular, it will be a rectangle on top of the graph with these dimensions (at each data tick):
                            this.recognitionOverlay.add(match, this.models[this.curGestureIndex].getTick());

                            // one way to implement this would be to create a RecognitionRectangle with a run() function
                            // push them into an array (because we might have more than one that needs to be shown at each tick)
                            // and then call the run() function on each element inside the array on each tick()
                            // though I'm sure that there would definitely be nicer ways to visualize this...
                        }
                        this.recognitionOverlay.tick(this.models[this.curGestureIndex].getTick());
                    }
                }
            }
        };

        if (hidbridge.shouldUse()) {
            hidbridge.initAsync()
            .then(dev => {
                dev.onSerial = onSerialData;
            });
        }
    }


    resetGraph() {
        this.graphInitialized = false;
        this.webcamInitialized = false;
        this.recorderInitialized = false;
        // this.recorder.Disable();

        // mediaStream.stop();
        if (this.state.data.length > 0 && this.state.data[this.curGestureIndex].gestures.length == 0) {
            // delete the gesture
            let cloneData = this.state.data.slice();
            cloneData.splice(this.curGestureIndex, 1);
            this.setState({ data: cloneData });
        }
    }

    getGestureIndex(gid: number): number {
        for (let i = 0; i < this.state.data.length; i++) {
            if (this.state.data[i].gestureID == gid) return i;
        }

        return -1;
    }

    getSampleIndex(gid: number, sid: number): number {
        for (let i = 0; i < this.state.data[gid].gestures.length; i++) {
            if (this.state.data[gid].gestures[i].sampleID == sid) return i;
        }

        return -1;
    }

    renderCore() {
        const targetTheme = pxt.appTarget.appTheme;

        const backToMain = () => {
            let cloneData = this.state.data.slice();
            // update name
            cloneData[this.curGestureIndex].name = (ReactDOM.findDOMNode(this.refs["gesture-name-input"]) as HTMLInputElement).value;
            // update blocks if was touched
            if (this.shouldGenerateBlocks) this.generateBlocks();
            this.setState({ editGestureMode: false, editDescriptionMode: false, data: cloneData });

            this.resetGraph();
            this.recorder.PauseWebcam();
        }

        const newGesture = () => {
            this.setState({ editGestureMode: true, editDescriptionMode: false });
            this.resetGraph();
            this.state.data.push(new Types.Gesture());
            // TODO: change this method of keeping the current gesture index to something more reliable
            this.curGestureIndex = this.state.data.length - 1;
            this.models.push(new Model.SingleDTWCore(this.state.data[this.curGestureIndex].gestureID + 1, this.state.data[this.curGestureIndex].name));
        }

        const editGesture = (gestureID: number) => {
            this.setState({ editGestureMode: true, editDescriptionMode: false });
            this.resetGraph();
            this.curGestureIndex = this.getGestureIndex(gestureID);
        }

        const downloadGesture = (gestureID: number) => {
            let gestureIndex = this.getGestureIndex(gestureID);
            let zip = new JSZip();
            zip.file("gesture.json", JSON.stringify(this.state.data[gestureIndex]));
            zip.file("video.mp4", this.state.data[gestureIndex].displayVideoData, {base64: true});

            zip.generateAsync({type: "blob"}).then(function(content: any) {
                    // see FileSaver.js 
                    FileSaver.saveAs(content, "gesture.zip");
            });            
        }

        const importGesture = () => {
            document.getElementById("file-input-btn").click();
        }

        const handleFileSelect = (evt: any) => {
            let files = evt.target.files; // FileList object

            // files is a FileList of File objects. List some properties.
            for (let i = 0; i < files.length ; i++) {
                let importedGesture: Types.Gesture = new Types.Gesture();

                JSZip.loadAsync(files[i]).then((zip: any) => {
                    zip.forEach((relativePath: string, zipEntry: any) => {
                        // console.log(zipEntry);
                        if (zipEntry.name == "gesture.json") {
                            // set the parameters
                            zipEntry.async("string").then((text: string) => {
                                // console.log(text);
                                let parsedGesture = JSON.parse(text) as Types.Gesture;
                                importedGesture.description = parsedGesture.description;
                                importedGesture.displayGesture = parsedGesture.displayGesture;
                                importedGesture.gestures = parsedGesture.gestures;
                                importedGesture.labelNumber = parsedGesture.labelNumber;
                                importedGesture.name = parsedGesture.name;
                            })
                        }
                        else if (zipEntry.name == "video.mp4") {
                            // set the video
                            zipEntry.async("base64").then((data: any) => {
                                // using this base64 to blob conversion:
                                // https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
                                let byteCharacters = atob(data);
                                let byteNumbers = new Array(byteCharacters.length);

                                for (let i = 0; i < byteCharacters.length; i++)
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);

                                let byteArray = new Uint8Array(byteNumbers);
                                let blob = new Blob([byteArray], {type: "video/mp4"});

                                importedGesture.displayVideoLink = window.URL.createObjectURL(blob);
                                importedGesture.displayVideoData = blob;
                            })
                        }
                    });
                })

                let cloneData = this.state.data.slice();
                cloneData.push(importedGesture);
                let curIndex = cloneData.length - 1;
                this.models.push(new Model.SingleDTWCore(cloneData[curIndex].gestureID + 1, cloneData[curIndex].name));
                this.setState({ data: cloneData });
            }
        }

        const onConnectionStatusChange = (connectionStatus: boolean) => {
            if (this.state.connected != connectionStatus)
                this.setState({ connected: connectionStatus });
        }

        const onSampleDelete = (gid: number, sid: number) => {
            let gi = this.getGestureIndex(gid);
            let si = this.getSampleIndex(gi, sid);

            let cloneData = this.state.data.slice();

            cloneData[gi].gestures.splice(si, 1);
            this.models[this.curGestureIndex].Update(cloneData[gi].getCroppedData());
            this.shouldGenerateBlocks = true;
            cloneData[gi].displayGesture = this.models[this.curGestureIndex].GetMainPrototype();

            this.setState({ data: cloneData });
        }

        const onSampleCrop = (gid: number, sid: number, newStart: number, newEnd: number) => {
            let gi = this.getGestureIndex(gid);
            let si = this.getSampleIndex(gi, sid);

            let cloneData = this.state.data.slice();

            cloneData[gi].gestures[si].cropStartIndex = newStart;
            cloneData[gi].gestures[si].cropEndIndex = newEnd;

            this.models[this.curGestureIndex].Update(cloneData[gi].getCroppedData());
            this.shouldGenerateBlocks = true;
            cloneData[gi].displayGesture = this.models[this.curGestureIndex].GetMainPrototype();

            this.setState({ data: cloneData });
        }

        const initGraph = (elem: any) => {
            if (elem != null && !this.graphInitialized) {
                // initialize SVG
                let graph = Viz.d3.select(elem);

                let svgX_rt = graph.select("#realtime-graph-x");
                let svgY_rt = graph.select("#realtime-graph-y");
                let svgZ_rt = graph.select("#realtime-graph-z");

                let width = graph.node().offsetWidth - 2 * 16;
                let height = 75;
                let maxVal = 2450;
                let dx = 7;

                this.graphX = new Viz.RealTimeGraph(svgX_rt, width, height, maxVal, dx, "red");
                this.graphY = new Viz.RealTimeGraph(svgY_rt, width, height, maxVal, dx, "green");
                this.graphZ = new Viz.RealTimeGraph(svgZ_rt, width, height, maxVal, dx, "blue");

                this.recognitionOverlay = new Viz.RecognitionOverlay(graph.select("#recognition-overlay"), width, height, dx);

                this.graphInitialized = true;
            }
        }

        const initRecorder = (elem: any) => {
            if (elem != null && !this.recorderInitialized) {
                // const gestureState = this;
                const onNewSampleRecorded = (gestureIndex: number, newSample: Types.GestureSample) => {

                    let cloneData = this.state.data.slice();
                    // do not change the order of the following lines:
                    cloneData[gestureIndex].gestures.push(newSample);
                    this.models[this.curGestureIndex].Update(cloneData[gestureIndex].getCroppedData());
                    this.shouldGenerateBlocks = true;
                    cloneData[gestureIndex].displayGesture = this.models[this.curGestureIndex].GetMainPrototype();
                    // TODO: allow users to change the video in the future.
                    // Probably just for the demo:
                    cloneData[gestureIndex].displayVideoLink = cloneData[gestureIndex].gestures[0].videoLink;
                    cloneData[gestureIndex].displayVideoData = cloneData[gestureIndex].gestures[0].videoData;
                    this.setState({ data: cloneData });

                    this.forceUpdate();

                    // focus the scrollbar on the latest sample
                    let scrollBarDiv = document.getElementById("gestures-fluid-container");
                    scrollBarDiv.scrollLeft = scrollBarDiv.scrollWidth;

                    // resize the scrollbar based on the window size:
                    let totalWidth = document.getElementById("recorded-gestures").offsetWidth;
                    let dispGestureWidth = document.getElementById("display-gesture").offsetWidth;
                    let samplesContainerWidth = totalWidth - dispGestureWidth - 40;

                    scrollBarDiv.style.width = samplesContainerWidth.toString() + "px";
                }

                this.recorder = new Recorder.Recorder(this.curGestureIndex, Recorder.RecordMode.PressAndHold, onNewSampleRecorded);
                this.recorder.initWebcam("webcam-video");
                this.recorder.initRecordButton("record-btn");
                this.recorderInitialized = true;
            }
        }

        const onRecordMethodChange = (event: any) => {
            let element = document.getElementById("record-mode-select") as HTMLSelectElement;

            switch(element.value) {
                case "PressAndHold":
                    this.recorder.SetRecordingMethod(Recorder.RecordMode.PressAndHold);
                break;

                case "PressToToggle":
                    this.recorder.SetRecordingMethod(Recorder.RecordMode.PressToToggle);
                break;
            }
        }

        const renameGesture = (event: any) => {
            let cloneData = this.state.data.slice();
            cloneData[this.curGestureIndex].name = event.target.value;
            this.models[this.curGestureIndex].UpdateName(cloneData[this.curGestureIndex].name);
            this.shouldGenerateBlocks = true;

            this.setState({ data: cloneData });
        }

        const renameDescription = (event: any) => {
            let cloneData = this.state.data.slice();
            cloneData[this.curGestureIndex].description = event.target.value;
            this.models[this.curGestureIndex].UpdateDescription(cloneData[this.curGestureIndex].description);
            this.shouldGenerateBlocks = true;

            this.setState({ data: cloneData });
        }

        const toggleEditDescription = (event: any) => {
            if (this.state.editDescriptionMode)
                this.setState({ editDescriptionMode: false });
            else
                this.setState({ editDescriptionMode: true });
        }

        const inputStyle = { height: "30px", padding: "auto auto auto 6px" };
        const colossalStyle = { fontSize: "5rem", margin: "0" };
        const sampleMarginStyle = { margin: "0 10px 10px 0;" };
        const headerStyle = { height: "60px" };
        const buttonHeightStyle = { height: "30px" };
        const videoStyle = { height: "258px", margin: "15px 0 15px 0" };
        const mainGraphStyle = { margin: "15px 15px 15px 0" };
        
        // const scrollBarContainer = { overflowX: "scroll", width: "1500px" };

        return (
            <sui.Modal open={this.state.visible} className="gesturedialog" size="fullscreen"
                onClose={() => this.hide() } dimmer={true} closeIcon={false} closeOnDimmerClick>
                <sui.Segment attached="top">
                    {this.state.editGestureMode
                        ?
                        <button className="ui button icon huge clear left floated" onClick={() => backToMain() }>
                            <i className="icon chevron left"></i>
                        </button>
                        :
                        <span className="ui header left floated">{lf("Gesture Toolbox")}</span>
                    }
                    <Indicator.ConnectionIndicator
                        parent={ this }
                        onConnStatChangeHandler={ onConnectionStatusChange }
                        class={ "right floated" }
                    />
                    {/* <button className="ui button icon huge clear" onClick={() => this.hide() }>
                        <i className="icon close"></i>
                    </button> */}
                </sui.Segment>
                <div className="ui segment bottom attached tab active tabsegment">
                {
                    this.state.editGestureMode == false ?
                    <div className="ui">
                        <div className="ui cards">
                            <codecard.CodeCardView
                                        key={'newpgesture'}
                                        icon="wizard outline"
                                        iconColor="primary"
                                        name={lf("New Gesture...") }
                                        description={lf("Creates a new empty gesture") }
                                        onClick={() => newGesture() }
                                        />
                            <codecard.CodeCardView
                                        key={'importgesture'}
                                        icon="upload outline"
                                        iconColor="secondary"
                                        name={lf("Import Gesture...") }
                                        description={lf("Imports gesture from your computer") }
                                        onClick={() => importGesture() }
                                        />
                        </div>
                        <input type="file" id="file-input-btn" name="files[]" multiple onChange={handleFileSelect}></input>
                         <div className="ui divider"></div> 
                        {
                            this.state.data.length == 0 ? undefined :
                            <div>
                                {
                                    this.state.data.map((gesture) =>
                                        <div className="ui segments link-effect gesture-container"> 
                                            <div className="ui segment inverted teal" style={headerStyle}>
                                                <div className="ui header inverted left floated">
                                                    {gesture.name}
                                                </div>
                                                <button className="ui icon button purple inverted compact tiny right floated" onClick={() => {editGesture(gesture.gestureID)}}>
                                                    Edit Gesture
                                                </button>
                                                <button className="ui icon button blue inverted compact tiny right floated" onClick={() => {downloadGesture(gesture.gestureID)}}>
                                                    <i className="icon cloud download"></i>
                                                </button>
                                                {/* <button className="ui icon button violet inverted compact tiny right floated" onClick={() => {createGestureBlock(gesture.gestureID)}}>
                                                    <i className="icon puzzle"></i>
                                                    &nbsp;Create Block
                                                </button> */}
                                            </div>
                                            <div className="ui segment">
                                                <div className="ui grid">
                                                    <video style={videoStyle} className="flipped-video" src={gesture.displayVideoLink} autoPlay loop></video>
                                                    <GraphCard
                                                        key={ gesture.gestureID }
                                                        editable={ false }
                                                        parent={ this }
                                                        data={ gesture.displayGesture }
                                                        dx={ 7 }
                                                        graphHeight={ 70 }
                                                        maxVal={ 2450 }
                                                        style={ mainGraphStyle }
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        }
                    </div>
                    :
                    <div>
                        <div className="ui segment three column grid">
                            <div className="four wide column">
                                {
                                    this.state.connected ?
                                    <video id="webcam-video" className="flipped-video"></video>
                                    :
                                    <div>Not Connected</div>
                                }
                            </div>
                            <div className="nine wide column">
                                {
                                    this.state.connected ?
                                    <div ref={initGraph}>
                                        <svg className="row" id="realtime-graph-x"></svg>
                                        <svg className="row" id="realtime-graph-y"></svg>
                                        <svg className="row" id="realtime-graph-z"></svg>
                                        <svg id="recognition-overlay"></svg>
                                    </div>
                                    :
                                    <div>
                                        <ol className="ui list">
                                            <li>Connect circuit playground</li>
                                            <li>Set to program mode</li>
                                            <li>Upload <em>streamer.uf2</em></li>
                                        </ol>
                                    </div>
                                }
                            </div>
                            <div className="three wide column">
                                {
                                    this.state.connected ?
                                    <div ref={initRecorder} className="ui segments basic">
                                        <div className="ui segment basic center aligned">
                                            <button id="record-btn" className="circular ui icon button" style={colossalStyle}>
                                                <i className="icon record"></i>
                                            </button>
                                        </div>
                                        <div className="ui segment basic center aligned">
                                            <span className="ui text">Record method:</span>
                                            <br/>
                                            <br/>
                                            
                                            <select id="record-mode-select" className="ui dropdown" onChange={onRecordMethodChange}>
                                                <option value="PressAndHold">Press &amp; Hold</option>
                                                <option value="PressToToggle">Press to Toggle</option>
                                            </select>                                            
                                        </div>
                                    </div>
                                    :
                                    <button id="program-streamer-btn" className="ui button icon-and-text primary fluid download-button big">
                                        <i className="download icon icon-and-text"></i>
                                        <span className="ui text">Program Streamer</span>
                                    </button>
                                }
                            </div>
                        </div>
                        <div id="recorded-gestures">
                            <div className="ui segments" id="display-gesture">
                                <div className="ui segment inverted teal" style={headerStyle}>
                                    <div className="ui action input left floated">
                                        <input style={inputStyle} type="text" ref="gesture-name-input" value={this.state.data[this.curGestureIndex].name} onFocus={() => {this.recorder.PauseEventListeners();}} onBlur={() => {this.recorder.ResumeEventListeners();}} onChange={renameGesture}></input>
                                        <button className="ui icon button compact tiny" style={buttonHeightStyle}>
                                            <i className="save icon"></i>
                                        </button>
                                    </div>
                                    <button className="ui basic button right floated compact tiny blue" ref="description-add-btn" onClick={toggleEditDescription}>
                                        <i className="icon add circle"></i>
                                        Add Description
                                    </button>
                                </div>
                                <div className="ui segment">
                                    <div className="ui grid">
                                        {
                                            this.state.data[this.curGestureIndex].gestures.length == 0 ?
                                            <video style={videoStyle} src="" autoPlay loop></video>
                                            :
                                            <video style={videoStyle} className="flipped-video" src={this.state.data[this.curGestureIndex].displayVideoLink} autoPlay loop></video>
                                        }
                                        {
                                            this.state.data[this.curGestureIndex].gestures.length == 0 ?
                                            undefined
                                            :
                                            <GraphCard
                                                key={ this.state.data[this.curGestureIndex].displayGesture.sampleID }
                                                editable={ false }
                                                parent={ this }
                                                data={ this.state.data[this.curGestureIndex].displayGesture }
                                                dx={ 7 }
                                                graphHeight={ 70 }
                                                maxVal={ 2450 }
                                                style={ mainGraphStyle }
                                            />
                                        }
                                    </div>
                                </div>
                                {
                                this.state.editDescriptionMode ? 
                                <div className="ui segment">
                                    <div className="ui form">
                                        <div className="field">
                                            <label>Gesture Description</label>
                                            <textarea rows={2} value={this.state.data[this.curGestureIndex].description} onFocus={() => {this.recorder.PauseEventListeners();}} onBlur={() => {this.recorder.ResumeEventListeners();}} onChange={renameDescription}></textarea>
                                        </div>
                                    </div>
                                </div> 
                                : undefined
                                }
                            </div>
                            <div id="gestures-fluid-container">
                            {
                                this.state.data[this.curGestureIndex].gestures.map((sample) =>
                                    <GraphCard
                                        key={ sample.sampleID }
                                        editable={ true }
                                        parent={ this }
                                        gestureID={ this.state.data[this.curGestureIndex].gestureID }
                                        sampleID={ sample.sampleID }
                                        dx={ 7 }
                                        graphHeight={ 80 }
                                        maxVal={ 2450 }
                                        onDeleteHandler={ onSampleDelete }
                                        onCropHandler={ onSampleCrop }
                                        style={ sampleMarginStyle }
                                    />
                                )
                            }
                            </div>
                            </div>
                        </div>
                    }
                    </div>
            </sui.Modal>
        )
    }
}