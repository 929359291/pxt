export const d3 = require('d3');
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as sui from "./../sui";
import { Point, Gesture, GestureSample } from "./types";

export interface IGraphCard { parent?: any, gestureID?: number, sampleID?: number, dx?: number, graphHeight?: number, maxVal?: number }
export interface GraphCardState { editMode?: boolean }

export class GraphCard extends React.Component<IGraphCard, GraphCardState> {
    public static connected: boolean = false;

    private parentData: Gesture[];
    private sample: GestureSample;

    constructor(props: IGraphCard) {
        super(props);
        // init
        this.parentData = props.parent.state.data;

        let gid = this.getGestureIndex(props.gestureID);
        let sid = this.getSampleIndex(gid, props.sampleID);

        this.sample = props.parent.state.data[gid].gestures[sid];

        this.setState({ editMode: false });
    }

    getGestureIndex(gid: number): number {
        for (let i = 0; i < this.parentData.length; i++) {
            if (this.parentData[i].gestureID == gid) return i;
        }

        return -1;
    }

    getSampleIndex(gid: number, sid: number): number {
        for (let i = 0; i < this.parentData[gid].gestures.length; i++) {
            if (this.parentData[gid].gestures[i].sampleID == sid) return i;
        }

        return -1;
    }

    componentDidUpdate() {
        ($('.ui.embed') as any).embed();
    }

    // on "edit" click 
    // setState -> editMode: true

    // on "delete" click 
    // parent.onSampleDeleteHandler(this) (or use the sampleID)
    // and then the parents state will get updated (as the shouldComponentUpdate will detect a change in the number of samples)

    // on "crop" event
    // parent.onSampleCropHandler(s, e);

    componentDidMount() {
        let width = this.sample.rawData.length * this.props.dx;
        let height = this.props.graphHeight;

        let y = d3.scaleLinear()
            .domain([-this.props.maxVal, +this.props.maxVal])
            .range([height, 0]);

        let smoothedLine = d3.line()
            .x((d: number, i: number) => {
                return i * this.props.dx;
            })
            .y((d: number, i: number) => {
                return d;
            })
            .curve(d3.curveCardinal);

        let dataX: number[] = [];
        let dataY: number[] = [];
        let dataZ: number[] = [];

        for (let i = 0; i < this.sample.rawData.length; i++) {
            dataX.push(y(this.sample.rawData[i].X));
            dataY.push(y(this.sample.rawData[i].Y));
            dataZ.push(y(this.sample.rawData[i].Z));
        }

        d3.select(ReactDOM.findDOMNode(this.refs["graphContainer"]))
            .attr("style", "width: " + width + "px;");

        let svgX = d3.select(ReactDOM.findDOMNode(this.refs["svgX"]));
        let svgY = d3.select(ReactDOM.findDOMNode(this.refs["svgY"]));
        let svgZ = d3.select(ReactDOM.findDOMNode(this.refs["svgZ"]));

        svgX.attr("width", width)
            .attr("height", height);
        svgY.attr("width", width)
            .attr("height", height);
        svgZ.attr("width", width)
            .attr("height", height);

        svgX.append("path")
            .attr("d", smoothedLine(dataX))
            .attr("stroke", "red")
            .attr("stroke-width", 1)
            .attr("fill", "none");
        svgY.append("path")
            .attr("d", smoothedLine(dataY))
            .attr("stroke", "green")
            .attr("stroke-width", 1)
            .attr("fill", "none");
        svgZ.append("path")
            .attr("d", smoothedLine(dataZ))
            .attr("stroke", "blue")
            .attr("stroke-width", 1)
            .attr("fill", "none");
    }

    render() {
        return (
            <div>
                <div ref="graphContainer" className="sample-graph">
                    <svg ref="svgX"></svg>
                    <svg ref="svgY"></svg>
                    <svg ref="svgZ"></svg>
                </div>
            </div>
        );
    }
}
