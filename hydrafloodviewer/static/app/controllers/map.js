(function () {
	'use strict';
	angular.module('baseApp')
	.controller('hydrafloodviewer' ,function ($scope, $timeout, MapService) {

		/* global variables to be tossed around like hot potatoes */
		$scope.initdate = '';

		var map,
		selected_date,
		browse_layer,
		basemap_layer,
		precip_layer,
		historical_layer,
		sentinel1_layer,
		admin_layer,
		flood_layer,
		drawing_polygon,
		$layers_element;

		$('.js-range-slider').ionRangeSlider({
			skin: "round",
			type: "double",
			grid: true,
			from: 0,
			to: 11,
			values: [
				"Jan", "Feb", "Mar", "Apr", "May", "Jun",
				"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
			]
		});
		$layers_element = $('#layers');
		var browseSlider = $('#browse-opacity').slider();
		var precipSlider = $('#precip-opacity').slider();
		var historicalSlider = $('#historical-opacity').slider();
		var sentinel1Slider = $('#sentinel1-opacity').slider();
		var floodSlider = $('#flood-opacity').slider();
		var floodSlider1 = $('#flood1-opacity').slider();

		// init map
		map = L.map('map',{
			center: [16.8,95.7],
			zoom: 8,
			minZoom:2,
			maxZoom: 16,
			maxBounds: [
				[-120, -220],
				[120, 220]
			],
		});

		L.Control.Custom = L.Control.Layers.extend({
			onAdd: function () {
				this._initLayout();
				this._addElement();
				this._update();
				return this._container;
			},
			_addElement: function () {
				var elements = this._container.getElementsByClassName('leaflet-control-layers-list');
				var div = L.DomUtil.create('div', '', elements[0]);
				div.innerHTML = '<div class="leaflet-control-layers leaflet-control-layers-expanded">'+
				'<input class="leaflet-control-layers-overlays" name="basemap_selection" id="street" checked="checked" value="street" type="radio">Streets</input>'+
				'<input class="leaflet-control-layers-overlays" name="basemap_selection" id="satellite" value="satellite" type="radio">Satellite</input>'+
				'<input class="leaflet-control-layers-overlays" name="basemap_selection" id="terrain" value="terrain" type="radio">Terrain</input></div>';
			}
		});

		var control = new L.Control.Custom().addTo(map);

		// Initialise the FeatureGroup to store editable layers
		var editableLayers = new L.FeatureGroup();
		map.addLayer(editableLayers);

		var drawPluginOptions = {
			draw: {
				polygon: {
					allowIntersection: false, // Restricts shapes to simple polygons
					drawError: {
						color: '#e1e100', // Color the shape will turn when intersects
						message: '<strong>Oh snap!<strong> you can\'t draw that!' // Message that will show when intersect
					},
					shapeOptions: {
						color: '#97009c'
					}
				},
				// disable toolbar item by setting it to false
				polyline: false,
				circle: false, // Turns off this drawing tool
				circlemarker: false,
				rectangle: true,
				marker: false,
			},
			edit: {
				featureGroup: editableLayers, //REQUIRED!!
				edit: true
			}
		};

		// Initialise the draw control and pass it the FeatureGroup of editable layers
		var drawControl = new L.Control.Draw(drawPluginOptions);
		map.addControl(drawControl);

		map.on('draw:created', function(e) {
			editableLayers.clearLayers();
			var type = e.layerType,
			layer = e.layer;
			drawing_polygon = [];
			var userPolygon = layer.toGeoJSON();
			drawing_polygon.push('ee.Geometry.Polygon(['+ JSON.stringify(userPolygon.geometry.coordinates[0])+'])');
			updateFloodMapLayer();
			updatePermanentWater();
			editableLayers.addLayer(layer);
		});
		map.on('draw:edited', function(e) {
			var editedlayers = e.layers;
			editedlayers.eachLayer(function(layer) {
				var userPolygon = layer.toGeoJSON();
				drawing_polygon = [];
				drawing_polygon.push('ee.Geometry.Polygon(['+ JSON.stringify(userPolygon.geometry.coordinates[0])+'])');
				updateFloodMapLayer();
				updatePermanentWater();

			});
		});
		map.on('draw:deleted', function(e) {
			var userPolygon = '';
			drawing_polygon = '';
		});


		basemap_layer = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
			attribution: '<a href="https://google.com/maps" target="_">Google Maps</a>;',
			subdomains:['mt0','mt1','mt2','mt3']
		}).addTo(map);

		selected_date = $('#date_selection').val();
		var viirs_product = "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1";
		browse_layer = addGibsLayer(browse_layer,viirs_product,selected_date);
		browse_layer.setOpacity(0);
		browseSlider.slider('disable');

		/**
		* Add file upload button on map
		*/
		var customControl = L.Control.extend({
			options: {
				position: 'topleft'
			},
			onAdd: function (map) {
				var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
				container.innerHTML = "<label for='input-file2' style='margin-left:7px;margin-top:5px;font-size:15px;cursor: pointer;' title='Load local file (Geojson, KML)'><span class='glyphicon glyphicon-folder-open' aria-hidden='true'></span><input type='file' class='hide' id='input-file2' accept='.kml,.kmz,.json,.geojson,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz'></label>";
				container.style.backgroundColor = '#f4f4f4';
				container.style.width = '35px';
				container.style.height = '35px';
				container.style.backgroundSize = "30px 30px";
				return container;
			}
		});
		map.addControl(new customControl());

		/**
		* Alert
		*/
		$scope.closeAlert = function () {
			$('.custom-alert').addClass('display-none');
			$scope.alertContent = '';
		};

		var showErrorAlert = function (alertContent) {
			$scope.alertContent = alertContent;
			$('.custom-alert').removeClass('display-none').removeClass('alert-info').removeClass('alert-success').addClass('alert-danger');
		};

		var showSuccessAlert = function (alertContent) {
			$scope.alertContent = alertContent;
			$('.custom-alert').removeClass('display-none').removeClass('alert-info').removeClass('alert-danger').addClass('alert-success');
		};

		var showInfoAlert = function (alertContent) {
			$scope.alertContent = alertContent;
			$('.custom-alert').removeClass('display-none').removeClass('alert-success').removeClass('alert-danger').addClass('alert-info');
		};

		/**
		* Change permanent water color
		*/
		$('#color-picker-water').on('change', function() {
			$("#color-picker-wrapper-water").css("background-color", $(this).val());
			updatePermanentWater();
		});
		$("#color-picker-wrapper-water").css("background-color", $("#color-picker-water").val());

		/**
		* Change flood color
		*/
		$('#color-picker-flood').on('change', function() {
			$("#color-picker-wrapper-flood").css("background-color", $(this).val());
			updateFloodMapLayer();
		});
		$("#color-picker-wrapper-flood").css("background-color", $("#color-picker-flood").val());

		/**
		* Change basemap layer(satellite, terrain, street)
		*/
		$('input[type=radio][name=basemap_selection]').change(function(){
			var selected_basemap = $(this).val();
			if(selected_basemap === "street"){
				basemap_layer.setUrl('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}');
			}else if(selected_basemap === "satellite"){
				basemap_layer.setUrl('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}');
			}else if(selected_basemap === "terrain"){
				basemap_layer.setUrl('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}');
			}
		});

		/**
		* legend controller
		*/
		$(".legend-info-button").click(function () {
			$(".legend-tabs").toggle();
			$("#legend-content").toggle();
			if ($("#legend-content").is(":visible") === true) {
				$("#legend-collapse").css("display","inline-block");
				$("#legend-expand").css("display","none");
			}
			else {
				$("#legend-collapse").css("display","none");
				$("#legend-expand").css("display","inline-block");
			}
		});
		$("#tab-water").click(function () {
			$("#legend-tab-water").css("display", "block");
			$("#legend-tab-precip").css("display", "none");
			$("#tab-water").addClass("active");
			$("#tab-precip").removeClass("active");
		});
		$("#tab-precip").click(function () {
			$("#legend-tab-water").css("display", "none");
			$("#legend-tab-precip").css("display", "block");
			$("#tab-precip").addClass("active");
			$("#tab-water").removeClass("active");
		});
		$("#tab-water").click();

		/**
		* Update layers when date selection is changed
		*/
		$('#date_selection').change(function(){
			updateFloodMapLayer();
			updatePrecipitationData();
			var prod = $('#browse_selection').val();
			var id = prod.split('|')[1];
			var template =
			'//gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/' +
			id + '/default/' + selected_date + '/{tileMatrixSet}/{z}/{y}/{x}.jpg';
			browse_layer.setUrl(template);
		});

		/**
		* Usecase messagebox toggle
		*/
		$(".event-info-button").click(function () {
			$("#event-content").toggle();
			if ($("#event-content").is(":visible") === true) {
				$("#event-collapse").css("display","inline-block");
				$("#event-expand").css("display","none");
			}
			else {
				$("#event-collapse").css("display","none");
				$("#event-expand").css("display","inline-block");
			}
		});

		/**
		* Layer opacity
		*/
		$('#precip-opacity').change(function(){
			var opac = parseFloat($('input[id="precip-opacity"]').slider('getValue'));
			precip_layer.setOpacity(opac);
		});

		$('#historical-opacity').change(function(){
			var opac = parseFloat($('input[id="historical-opacity"]').slider('getValue'));
			historical_layer.setOpacity(opac);
		});

		$('#flood1-opacity').change(function(){
			var opac = parseFloat($('input[id="flood1-opacity"]').slider('getValue'));
			flood_layer.setOpacity(opac);
		});

		/**
		* Browse Imagery toggle
		*/
		$("#browse-check").on("click",function(){
			if(this.checked){
				browseSlider.slider('enable');
				var opac = parseFloat($('input[id="browse-opacity"]').slider('getValue'));
				browse_layer.setOpacity(opac);
			}
			else{
				browseSlider.slider('disable');
				browse_layer.setOpacity(0);
			}
		});

		/**
		* Precipiatation Data toggle
		*/
		$("#precip-check").on("click",function(){
			if(this.checked){
				precipSlider.slider('enable');
				var opac = parseFloat($('input[id="precip-opacity"]').slider('getValue'));
				precip_layer.setOpacity(opac);
			}
			else{
				precipSlider.slider('disable');
				precip_layer.setOpacity(0);
			}
		});

		/**
		* Permanent water map toggle
		*/
		$("#historical-check").on("click",function(){
			if(this.checked){
				historicalSlider.slider('enable');
				var opac = parseFloat($('input[id="historical-opacity"]').slider('getValue'));
				historical_layer.setOpacity(opac);
				$("#toggle_switch_historic").prop('checked',true).change();
			}
			else{
				historicalSlider.slider('disable');
				historical_layer.setOpacity(0);
				$("#toggle_switch_historic").prop('checked',false).change();
			}
		});

		/**
		* Flood map toggle
		*/
		$("#flood-check").on("click",function(){
			if(this.checked){
				floodSlider1.slider('enable');
				var opac = parseFloat($('input[id="flood1-opacity"]').slider('getValue'));
				flood_layer.setOpacity(opac);
				$("#toggle_switch_daily").prop('checked',true).change();
			}
			else{
				floodSlider1.slider('disable');
				flood_layer.setOpacity(0);
				$("#toggle_switch_daily").prop('checked',false).change();
			}
		});

		/**
		* Permanent water map toggle in legend box
		*/
		$("#toggle_switch_historic").on("change",function(){
			if(this.checked){
				historicalSlider.slider('enable');
				var opac = parseFloat($('input[id="historical-opacity"]').slider('getValue'));
				historical_layer.setOpacity(opac);
				$("#historical-check").prop('checked',true);
			}
			else{
				historicalSlider.slider('disable');
				historical_layer.setOpacity(0);
				$("#historical-check").prop('checked',false);
			}
		});

		/**
		* Flood map toggle in legend box
		*/
		$("#toggle_switch_daily").on("change",function(){
			if(this.checked){
				floodSlider1.slider('enable');
				var opac = parseFloat($('input[id="flood1-opacity"]').slider('getValue'));
				flood_layer.setOpacity(opac);
				$("#flood-check").prop('checked',true);
			}
			else{
				floodSlider1.slider('disable');
				flood_layer.setOpacity(0);
				$("#flood-check").prop('checked',false);
			}
		});

		/**
		* Change NRT Browse Imagery
		*/
		$('#browse_selection').change(function(){
			var prod = $('#browse_selection').val();
			var id = prod.split('|')[1];
			var template =
			'//gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/' +
			id + '/default/' + selected_date + '/{tileMatrixSet}/{z}/{y}/{x}.jpg';
			browse_layer.setUrl(template);
		});

		/**
		* Change NRT Browse Imagery opacity
		*/
		$('#browse-opacity').change(function(){
			var opac = parseFloat($('input[id="browse-opacity"]').slider('getValue'));
			browse_layer.setOpacity(opac);
		});

		/**
		* Update permanent water map
		*/
		$("#update-button").on("click",function(){
			updatePermanentWater();
		});

		/**
		* Update precipitation map
		*/
		$('#cmap_selection').change(function(){
			updatePrecipitationData();
		});
		$('#product_selection').change(function(){
			updatePrecipitationData();
		});


		$scope.initMap = function (date, fcolor, sensor) {
			$scope.showLoader = true;
			var parameters = {
				date: date,
				fcolor: fcolor,
				sensor: sensor
			};
			MapService.getMap(parameters)
			.then(function (data) {
				$scope.showLoader = false;
				flood_layer = addMapLayer(flood_layer, data);

			}, function (error) {
				$scope.showLoader = false;
				console.log(error);
			});
		};

		$scope.getpermanentwater = function (startYear, endYear, startMonth, endMonth, method, wcolor) {
			$scope.showLoader = true;
			var parameters = {
				startYear: startYear,
				endYear: endYear,
				startMonth: startMonth,
				endMonth: endMonth,
				method: method,
				wcolor: wcolor
			};
			MapService.getPermanentWater(parameters)
			.then(function (data) {
				$scope.showLoader = false;
				historical_layer = addMapLayer(historical_layer, data);
			}, function (error) {
				$scope.showLoader = false;
				console.log(error);
			});
		};

		$scope.getPrecipMap = function () {
			var prod = $('#product_selection').val();
			var cmap = $('#cmap_selection').val();
			var accum = prod.split('|')[0];
			var selected_date = $('#date_selection').val();
			var parameters = {
				date: selected_date,
				cmap: cmap,
				accum: accum,
			};
			MapService.getPrecipitationData(parameters)
			.then(function (data) {
				precip_layer = addMapLayer(precip_layer, data);
				precip_layer.setOpacity(0);
				precipSlider.slider('disable');
			}, function (error) {
				console.log(error);
			});
		};

		/**
		* Upload Area Button
		**/
		var readFile = function (e) {
			var files = e.target.files;
			if (files.length > 1) {
				console.log('upload one file at a time');
			} else {
				//MapService.removeGeoJson(map);

				var file = files[0];
				var reader = new FileReader();
				reader.readAsText(file);

				reader.onload = function (event) {

					var textResult = event.target.result;
					var addedGeoJson;
					var extension = file.name.split('.').pop().toLowerCase();
					if ((['kml', 'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz'].indexOf(extension) > -1)) {
						var kmlDoc;

						if (window.DOMParser) {
							var parser = new DOMParser();
							kmlDoc = parser.parseFromString(textResult, 'text/xml');
						} else { // Internet Explorer
							kmlDoc = new ActiveXObject('Microsoft.XMLDOM');
							kmlDoc.async = false;
							kmlDoc.loadXML(textResult);
						}
						addedGeoJson = toGeoJSON.kml(kmlDoc);
					} else {
						try {
							addedGeoJson = JSON.parse(textResult);
						} catch (e) {
							alert('we only accept kml, kmz and geojson');
						}
					}

					if (((addedGeoJson.features) && (addedGeoJson.features.length === 1)) || (addedGeoJson.type === 'Feature')) {

						var geometry = addedGeoJson.features ? addedGeoJson.features[0].geometry : addedGeoJson.geometry;

						if (geometry.type === 'Polygon') {
							//MapService.addGeoJson(map, addedGeoJson);
							// Convert to Polygon
							var polygonArray = [];
							var shape = {};
							var _coord = geometry.coordinates[0];

							for (var i = 0; i < _coord.length; i++) {
								var coordinatePair = [(_coord[i][1]).toFixed(2), (_coord[i][0]).toFixed(2)];
								polygonArray.push(coordinatePair);
							}

							if (polygonArray.length > 500) {
								alert('Complex geometry will be simplified using the convex hull algorithm!');
							}

							polygonArray = polygonArray.map(function(elem) {
								return elem.map(function(elem2) {
									return parseFloat(elem2);
								});
							});
							editableLayers.clearLayers();
							var layer = L.polygon(polygonArray , {color: 'red'});
							drawing_polygon = [];
							var userPolygon = layer.toGeoJSON();
							drawing_polygon.push('ee.Geometry.Polygon(['+ JSON.stringify(userPolygon.geometry.coordinates[0])+'])');
							updateFloodMapLayer();
							updatePermanentWater();
							layer.addTo(map);
							map.fitBounds(layer.getBounds());
							editableLayers.addLayer(layer);

						} else {
							alert('multigeometry and multipolygon not supported yet!');
						}
					} else {
						alert('multigeometry and multipolygon not supported yet!');
					}
				};
			}
		};

		$('#input-file2').change(function (event) {
			readFile(event);
		});
		
			// function to add and update tile layer to map
			function addMapLayer(layer,url){
				layer = L.tileLayer(url,{attribution:
					'<a href="https://earthengine.google.com" target="_">' +
					'Google Earth Engine</a>;'}).addTo(map);
					return layer;
			}

			function updatePermanentWater(){
				$scope.showLoader = true;
				var startYear = $('#start_year_selection_historical').val();
				var endYear = $('#end_year_selection_historical').val();
				var slider = $("#month_range").data("ionRangeSlider");

				// Get values
				var startMonth = slider.result.from + 1;
				var endMonth= slider.result.to + 1;
				var method = 'discrete';
				var wcolor = $('#color-picker-water').val();
				var geom = JSON.stringify(drawing_polygon);

				if (startMonth === endMonth) { endMonth += 1; }

				var parameters = {
					startYear: startYear,
					endYear: endYear,
					startMonth: startMonth,
					endMonth: endMonth,
					method: method,
					wcolor: wcolor,
					geom: geom
				};
				MapService.getPermanentWater(parameters)
				.then(function (data) {
					$scope.showLoader = false;
					historical_layer.setUrl(data);
				}, function (error) {
					$scope.showLoader = false;
					console.log(error);
				});

			}
			function updateFloodMapLayer(){
				$scope.showLoader = true;
				var sensor_val = $('#sensor_selection').val();
				var flood_color = $('#color-picker-flood').val();
				var selected_date = $('#date_selection').val();
				var geom = JSON.stringify(drawing_polygon);
				var parameters = {
					date: selected_date,
					fcolor: flood_color,
					sensor: sensor_val,
					geom: geom
				};
				MapService.getMap(parameters)
				.then(function (data) {
					$scope.showLoader = false;
					flood_layer.setUrl(data);
				}, function (error) {
					$scope.showLoader = false;
					console.log(error);
				});

			}
			function updatePrecipitationData(){
				$scope.showLoader = true;
				var prod = $('#product_selection').val();
				var cmap = $('#cmap_selection').val();
				var accum = prod.split('|')[0];
				var selected_date = $('#date_selection').val();

				var parameters = {
					date: selected_date,
					cmap: cmap,
					accum: accum,
				};
				MapService.getPrecipitationData(parameters)
				.then(function (data) {
					$scope.showLoader = false;
					precip_layer.setUrl(data);
				}, function (error) {
					$scope.showLoader = false;
					console.log(error);
				});

			}


			function addGibsLayer(layer,product,date){
				var template =
				'//gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/' +
				'{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg';

				layer = L.tileLayer(template, {
					layer: product,
					tileMatrixSet: 'GoogleMapsCompatible_Level9',
					maxZoom: 9,
					time: date,
					tileSize: 256,
					subdomains: 'abc',
					noWrap: true,
					continuousWorld: true,
					// Prevent Leaflet from retrieving non-existent tiles on the
					// borders.
					bounds: [
						[-85.0511287776, -179.999999975],
						[85.0511287776, 179.999999975]
					],
					attribution:
					'<a href="https://wiki.earthdata.nasa.gov/display/GIBS" target="_">' +
					'NASA EOSDIS GIBS</a>;'
				});

				map.addLayer(layer);

				return layer;
			}
		});

	})();
