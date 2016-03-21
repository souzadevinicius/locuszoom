/* global d3,LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  Data Layer Class

  A data layer is an abstract class representing a data set and its
  graphical representation within a panel

*/

LocusZoom.DataLayer = function(id, layout, state) {

    this.initialized = false;

    this.id     = id;
    this.parent = null;
    this.svg    = {};

    this.layout = LocusZoom.mergeLayouts(layout || {}, LocusZoom.DataLayer.DefaultLayout);

    this.state = LocusZoom.mergeLayouts(state || {}, LocusZoom.DataLayer.DefaultState);

    this.data = [];
    this.metadata = {};

    this.getBaseId = function(){
        return this.parent.parent.id + "." + this.parent.id + "." + this.id;
    };

    // Tooltip methods
    this.tooltips = {};
    this.createTooltip = function(d, id){
        if (typeof this.layout.tooltip != "object"){
            throw ("DataLayer [" + this.id + "] layout does not define a tooltip");
        }
        if (typeof id != "string"){
            throw ("Unable to create tooltip: id is not a string");
        }
        this.tooltips[id] = {
            data: d,
            arrow: null,
            selector: d3.select(this.parent.parent.svg.node().parentNode).append("div")
                .attr("class", "lz-data_layer-tooltip")
                .attr("id", this.parent.getBaseId() + ".tooltip." + id)
        }
        if (this.layout.tooltip.html){
            this.tooltips[id].selector.html(LocusZoom.parseFields(d, this.layout.tooltip.html));
        } else if (this.layout.tooltip.divs){
            var i, div, selection;
            for (i in this.layout.tooltip.divs){
                div = this.layout.tooltip.divs[i];
                selection = this.tooltips[id].selector.append("div");
                if (div.id){ selection.attr("id", div.id); }
                if (div.class){ selection.attr("class", div.class); }
                if (div.style){ selection.style(div.style); }
                if (div.html){ selection.html(LocusZoom.parseFields(d, div.html)); }
            }
        }
        this.positionTooltip(id);
    };
    this.destroyTooltip = function(id){
        if (typeof id != "string"){
            throw ("Unable to destroy tooltip: id is not a string");
        }
        if (this.tooltips[id]){
            if (typeof this.tooltips[id].selector == "object"){
                this.tooltips[id].selector.remove();
            }
            delete this.tooltips[id];
        }
    };
    this.destroyAllTooltips = function(){
        var id;
        for (id in this.tooltips){
            this.destroyTooltip(id);
        }
    };
    this.positionTooltip = function(id){
        if (typeof id != "string"){
            throw ("Unable to position tooltip: id is not a string");
        }
        // Position the div itself
        this.tooltips[id].selector
            .style("left", (d3.event.pageX) + "px")			 
				    .style("top", (d3.event.pageY) + "px");
        // Create / update position on arrow connecting tooltip to data
        if (!this.tooltips[id].arrow){
            this.tooltips[id].arrow = this.tooltips[id].selector.append("div")
                .style("position", "absolute")
                .attr("class", "lz-data_layer-tooltip-arrow_top_left");
        }
        this.tooltips[id].arrow
            .style("left", "-1px")			 
				    .style("top", "-1px");
    };
    this.positionAllTooltips = function(){
        var id;
        for (id in this.tooltips){
            this.positionTooltip(id);
        }
    }

    // Get an object with the x and y coordinates of this data layer's origin in terms of the entire page
    // (useful for custom reimplementations this.positionTooltip())
    this.getPageOrigin = function(){
        var bounding_client_rect = this.parent.parent.svg.node().getBoundingClientRect();
        var x_scroll = document.documentElement.scrollLeft || document.body.scrollLeft;
        var y_scroll = document.documentElement.scrollTop || document.body.scrollTop;
        return {
            x: bounding_client_rect.left + this.parent.layout.origin.x + this.parent.layout.margin.left + x_scroll,
            y: bounding_client_rect.top + this.parent.layout.origin.y + this.parent.layout.margin.top + y_scroll,
        };
    };
    
    return this;

};

LocusZoom.DataLayer.DefaultState = {
};

LocusZoom.DataLayer.DefaultLayout = {
    type: "",
    fields: []
};

// Generate a y-axis extent functions based on the layout
LocusZoom.DataLayer.prototype.getYExtent = function(){
    return function(){
        var extent = d3.extent(this.data, function(d) {
            return +d[this.layout.y_axis.field];
        }.bind(this));
        // Apply upper/lower buffers, if applicable
        if (!isNaN(this.layout.y_axis.lower_buffer)){ extent[0] *= 1 - this.layout.y_axis.lower_buffer; }
        if (!isNaN(this.layout.y_axis.upper_buffer)){ extent[1] *= 1 + this.layout.y_axis.upper_buffer; }
        // Apply floor/ceiling, if applicable
        if (!isNaN(this.layout.y_axis.floor)){ extent[0] = Math.max(extent[0], this.layout.y_axis.floor); }
        if (!isNaN(this.layout.y_axis.ceiling)){ extent[1] = Math.min(extent[1], this.layout.y_axis.ceiling); }
        return extent;
    }.bind(this);
};

// Initialize a data layer
LocusZoom.DataLayer.prototype.initialize = function(){

    // Append a container group element to house the main data layer group element and the clip path
    this.svg.container = this.parent.svg.group.append("g")
        .attr("id", this.getBaseId() + ".data_layer_container");
        
    // Append clip path to the container element
    this.svg.clipRect = this.svg.container.append("clipPath")
        .attr("id", this.getBaseId() + ".clip")
        .append("rect");
    
    // Append svg group for rendering all data layer elements, clipped by the clip path
    this.svg.group = this.svg.container.append("g")
        .attr("id", this.getBaseId() + ".data_layer")
        .attr("clip-path", "url(#" + this.getBaseId() + ".clip)");

    // Flip the "initialized" bit
    this.initialized = true;

    return this;

};

LocusZoom.DataLayer.prototype.draw = function(){
    this.svg.container.attr("transform", "translate(" + this.parent.layout.cliparea.origin.x +  "," + this.parent.layout.cliparea.origin.y + ")");
    this.svg.clipRect
        .attr("width", this.parent.layout.cliparea.width)
        .attr("height", this.parent.layout.cliparea.height);
    this.positionAllTooltips();
    return this;
};

// Re-Map a data layer to new positions according to the parent panel's parent instance's state
LocusZoom.DataLayer.prototype.reMap = function(){
    this.destroyAllTooltips(); // hack - only non-visible tooltips should be destroyed
                               // and then recreated if returning to visibility
    var promise = this.parent.parent.lzd.getData(this.parent.parent.state, this.layout.fields); //,"ld:best"
    promise.then(function(new_data){
        this.data = new_data.body;
    }.bind(this));
    return promise;
};
