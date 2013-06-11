var gzipApp = angular.module('gzipApp', []);
gzipApp.controller('AppCtrl', function AppCtrl ($scope) {
  $scope.max_cw = 64;
  d3.csv('results.csv', function(d) {
    return {url: d.url,
            compressed_size: parseInt(d.compressed_size),
            decompressed_size: parseInt(d.decompressed_size),
            ratio: parseInt(d.compressed_size) / parseInt(d.decompressed_size),
            time: parseFloat(d.time),
           };
  }, function(data) {
    $scope.data = data;
    $scope.$digest();
    time_hist(data);
    compression_hist(data);
    congestion_window(data);
  });

});

gzipApp.directive('icwVisual', function() {
  var chart_width = 820;
  var chart_height = 100;
  chart_margins = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 10};

  return {
    restrict: 'E',
    scope: {
      val: '=',
      grouped: '='
    },
    link: function(scope, element, attrs) {      
      var chart = d3.select(element[0]).append('svg')
      .attr('class', 'chart')
      .attr('width', chart_width + chart_margins.left + chart_margins.right)
      .attr('height', chart_height + chart_margins.top + chart_margins.bottom)
      .append('g')
        .attr('transform', 'translate(' + chart_margins.left + ',' + chart_margins.top + ')');

      scope.$watch('max_cw', function(new_val, old_val) {
        console.log(new_val);
      });

      scope.$watch('val', function(data, old_val) {
        if (!data) {
          return;
        }
        // a theoretical model of tcp slow start
        var icw = 10;
        var cw = icw;
        var ssthresh = 64000;
        var max_cw = 64;
        var packet_size = 1500;
        var max_size = d3.max(data, function(d) { return d.decompressed_size; });
        var data = [];

        while (max_size > 0) {
          data.push(cw);
          max_size -= cw * packet_size;
          if (cw >= Math.floor(ssthresh / packet_size)) {
            cw += 1;
          }
          else {
            cw *= 2;
            if (cw * packet_size > ssthresh) {
              cw = Math.floor(ssthresh / packet_size);
            }
          }
          if (cw > max_cw) {
            ssthresh = cw * packet_size / 2;
            cw = icw;
          }
        }

        console.log(data);

        var x = d3.scale.linear()
          .domain([0, data.length])
          .range([0, chart_width]);

        /*
  var hist = d3.layout.histogram()
    .value(function(d) { return d.ratio; })
    .bins(x.ticks(50))
    (data);
*/
        var y = d3.scale.linear()
        .domain([0, d3.max(data)])
        .range([chart_height, chart_margins.bottom]);

        var line_gen = d3.svg.line()
        .x(function(d, i) { return x(i); })
        .y(function(d) { return y(d); });

        var xaxis = d3.svg.axis().scale(x).orient('bottom');

        var bar = chart.selectAll('.point')
        .data(data)
        .enter().append('g')
        .attr('class', 'point')
        .attr('transform', function(d, i) { return 'translate('+ x(i) + ',' + y(d) + ')'; });

        chart.append('path')
        .attr('class', 'line')
        .datum(data)
        .attr('d', line_gen);

        /*
  bar.append('text')
    .attr('dy', '-.75em')
    .attr('y', 6)
    .attr('x', x(hist[0].dx) / 2)
    .attr('text-anchor', 'middle')
    .text(function(d) { return d.y; });
*/
        chart.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,'+(chart_height)+')')
        .call(xaxis);
      });
    }
  };
});


var time_hist = function(data) {
  var chart_width = 820;
  var chart_height = 100;
  chart_margins = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 10};

  var chart = d3.select('body').append('svg')
    .attr('class', 'chart')
    .attr('width', chart_width + chart_margins.left + chart_margins.right)
    .attr('height', chart_height + chart_margins.top + chart_margins.bottom)
    .append('g')
      .attr('transform', 'translate(' + chart_margins.left + ',' + chart_margins.top + ')');

  var x = d3.scale.linear()
    .domain([0, d3.max(data, function(r) { return r.time; })])
    .range([0, chart_width]);

  var hist = d3.layout.histogram()
    .value(function(d) { return d.time; })
    .bins(x.ticks(50))
    (data);

  var y = d3.scale.linear()
    .domain([0, d3.max(hist, function(d) { return d.y; })])
    .range([chart_height, chart_margins.bottom]);

  var xaxis = d3.svg.axis().scale(x).orient('bottom');

  var bar = chart.selectAll('.bar')
    .data(hist)
      .enter().append('g')
        .attr('class', 'bar')
        .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });

  bar.append('rect')
    .attr('x', 1)
    .attr('width', x(hist[0].dx) - 1)
    .attr('height', function(d) { return chart_height - y(d.y); });

  bar.append('text')
    .attr('dy', '-.75em')
    .attr('y', 6)
    .attr('x', x(hist[0].dx) / 2)
    .attr('text-anchor', 'middle')
    .text(function(d) { return d.y; });

  chart.append('g')
      .attr('class', 'x axis')
          .attr('transform', 'translate(0,'+(chart_height)+')')
              .call(xaxis);
};

var compression_hist = function(data) {
  var chart_width = 820;
  var chart_height = 100;
  chart_margins = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 10};

  var chart = d3.select('body').append('svg')
    .attr('class', 'chart')
    .attr('width', chart_width + chart_margins.left + chart_margins.right)
    .attr('height', chart_height + chart_margins.top + chart_margins.bottom)
    .append('g')
      .attr('transform', 'translate(' + chart_margins.left + ',' + chart_margins.top + ')');

  var x = d3.scale.linear()
    .domain([0, d3.max(data, function(r) { return r.ratio; })])
    .range([0, chart_width]);

  var hist = d3.layout.histogram()
    .value(function(d) { return d.ratio; })
    .bins(x.ticks(50))
    (data);

  var y = d3.scale.linear()
    .domain([0, d3.max(hist, function(d) { return d.y; })])
    .range([chart_height, chart_margins.bottom]);

  var xaxis = d3.svg.axis().scale(x).orient('bottom');

  var bar = chart.selectAll('.bar')
    .data(hist)
      .enter().append('g')
        .attr('class', 'bar')
        .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });

  bar.append('rect')
    .attr('x', 1)
    .attr('width', x(hist[0].dx) - 1)
    .attr('height', function(d) { return chart_height - y(d.y); });

  bar.append('text')
    .attr('dy', '-.75em')
    .attr('y', 6)
    .attr('x', x(hist[0].dx) / 2)
    .attr('text-anchor', 'middle')
    .text(function(d) { return d.y; });

  chart.append('g')
      .attr('class', 'x axis')
          .attr('transform', 'translate(0,'+(chart_height)+')')
              .call(xaxis);
};

var congestion_window = function(data) {
};
