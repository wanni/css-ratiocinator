/*jslint browser: true, indent: 2, nomen: true, plusplus: true */
/*global _: true */
/*global $: true */
/*global jQuery: true */
/*global console: true */

(function () {
  "use strict";

  var script;

  function camel2dashed(str) {
    return str.replace(/([A-Z])/g, function (c) {return "-" + c.toLowerCase(); });
  }

  function computedCssNode(elt) {
    var style = window.getComputedStyle ? window.getComputedStyle(elt, null) : elt.currentStyle,
      styleValue;
    return _.reduce(_.keys(style),
      function (memo, prop) {
        styleValue = style.getPropertyValue(prop);
        if (styleValue) {
          memo[prop] = styleValue;
        }
        return memo;
      }, {});
  }

  function computedCssTree(elt) {
    return {
      tag: elt[0].tagName,
      klass: elt.attr('class'),
      id: elt.attr('id'),
      css: computedCssNode(elt[0]),
      children: _.map(elt.children(), function (c) { return computedCssTree($(c)); })
    };
  }

  function filterKeys(obj, valid_keys) {
    return _.intersection(_.keys(obj), valid_keys).reduce(function (result, key) {
      result[key] = obj[key];
      return result;
    }, {});
  }

  function objectIntersection(array) {
    function simpleIntersection(a, b) {
      return filterKeys(a, _.intersection(_.keys(a), _.keys(b)).filter(function (key) {
        return _.isEqual(a[key], b[key]);
      }));
    }
    function repeatedly(f) {
      return function (args) {
        if (args.length === 0) { return {}; }
        var seed = args.pop();
        return _.reduce(args, function (memo, obj) { return f(memo, obj); }, seed);
      };
    }

    return repeatedly(simpleIntersection)(array);
  }

  function objectDifference(a, b) {
    return filterKeys(a, _.difference(_.keys(a), _.keys(b)));
  }

  function liftHeritable(node) {
    var i, heritable = [
      'cursor', 'font-family', 'font-weight', 'font-stretch', 'font-style',
      'font-size', 'font-size-adjust', 'font', 'font-synthesis', 'font-kerning',
      'font-variant-ligatures', 'font-variant-position', 'font-variant-caps',
      'font-variant-numeric', 'font-variant-alternatives', 'font-variant-east-asian',
      'font-variant', 'font-feature-settings', 'font-language-override', 'text-transform',
      'white-space', 'tab-size', 'line-break', 'word-break', 'hyphens', 'word-wrap',
      'overflow-wrap', 'text-align', 'text-align-last', 'text-justify', 'word-spacing',
      'letter-spacing', 'text-indent', 'hanging-punctuation', 'text-decoration-skip',
      'text-underline-skip', 'text-emphasis-style', 'text-emphasis-color', 'text-emphasis',
      'text-emphasis-position', 'text-shadow', 'color', 'border-collapse', 'border-spacing',
      'caption-side', 'direction', 'elevation', 'empty-cells', 'line-height', 'list-style-image',
      'list-style-position', 'list-style-type', 'list-style', 'orphans', 'pitch-range',
      'pitch', 'quotes', 'richness', 'speak-header', 'speak-numeral', 'speak-punctuation',
      'speak', 'speech-rate', 'stress', 'visibility', 'voice-family', 'volume', 'widows'],
      disinherited_kids = _.map(node.children, liftHeritable),
      common = filterKeys(
        objectIntersection(_.map(disinherited_kids, function (k) { return k.css; })),
        heritable
      );

    for (i = 0; i < disinherited_kids.length; i++) {
      disinherited_kids[i].css = objectDifference(disinherited_kids[i].css, common);
    }
    $.extend(node.css, common);
    return {
      tag: node.tag,
      klass: node.klass,
      id: node.id,
      css: node.css,
      children: disinherited_kids
    };
  }

  function stripDefaultStyles(node) {
    var defaults = { background: 'rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box',
      border: '0px none rgb(0, 0, 0)', bottom: 'auto', clear: 'none', clip: 'auto', cursor: 'auto',
      direction: 'ltr', fill: '#000000', filter: 'none', float: 'none', kerning: '0', left: 'auto',
      mask: 'none', opacity: "1", outline: 'rgb(0, 0, 0) none 0px', overflow: 'visible', position: 'static',
      resize: 'none', right: 'auto', stroke: 'none', top: 'auto', zoom: '1'};

    _.each(_.keys(defaults), function (def) {
      if (node.css[def] === defaults[def]) {
        delete node.css[def];
      }
    });
    _.each(node.children, function (k) {
      stripDefaultStyles(k);
    });
  }

  function selectorsUsed(node) {
    function tagDict(node) {
      var dict = {};
      dict[node.tag] = true;
      if (node.klass) {
        dict['.' + node.klass] = true;
      }
      _.each(node.children, function (k) { $.extend(dict, tagDict(k)); });
      return dict;
    }
    return _.keys(tagDict(node));
  }

  function select(root, condition) {
    var collection = [];
    if (condition(root)) {
      collection.push(root);
    }
    _.each(root.children, function (k) { collection = collection.concat(select(k, condition)); });
    return collection;
  }

  function styleConsolidations(node) {
    return _.reduce(selectorsUsed(node),
      function (memo, selector) {
        var instances = select(node, function (k) {
          if (selector[0] === '.') {
            return ('.' + k.klass) === selector;
          }
          return k.tag === selector;
        });
        memo[selector] = objectIntersection(_.map(instances, function (i) { return i.css; }));
        return memo;
      }, {});
  }

  function renderStylesheet(snode, path) {
    var result = "",
      hasAttrs = false,
      block    = path + " {\n",
      attr,
      i,
      c,
      seen     = {},
      classy   = function (snode) {
        var x = snode.tag;
        if (snode.id) {
          x = "#" + snode.id;
        } else if (snode.klass) {
          x += "." + snode.klass.split(' ').join('.');
        }
        return x;
      },
      relative = function (snode, path) {
        return snode.id ? classy(snode) : path + ' > ' + classy(snode);
      };

    for (attr in snode.css) {
      if (snode.css.hasOwnProperty(attr)) {
        block += "\t" + attr + ': ' + snode.css[attr] + ";\n";
        hasAttrs = true;
      }
    }
    block += "}\n\n";
    if (hasAttrs) {
      result += block;
    }

    for (i = 0; i < snode.children.length; i++) {
      c = relative(snode.children[i], path);
      if (!seen.hasOwnProperty(c)) {
        seen[c] = true;
        result += renderStylesheet(snode.children[i], c);
      }
    }
    return result;
  }

  function onScriptsLoaded() {
    console.log("Lifting heritable styles...");
    var lifted = liftHeritable(computedCssTree($('body'))),
      tagWeights;
    console.log("Stripping default styles...");
    stripDefaultStyles(lifted);

    tagWeights = _.map(styleConsolidations(lifted), function (properties, tag) {
      var ret = {};
      ret[tag] = _.keys(properties).length;
      return ret;
    });
    console.log(JSON.stringify(tagWeights));
  }

  ////////////////////////////////////////////////////////////////////////////////////////
  // Load jQuery and underscore then begin the fun.
  console.log("Loading required external scripts...");
  script        = document.createElement("script");
  script.src    = "//ajax.googleapis.com/ajax/libs/jquery/1.8.2/jquery.min.js";
  script.onload = function () {
    jQuery.getScript(
      '//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.3.3/underscore-min.js',
      onScriptsLoaded
    );
  };
  document.getElementsByTagName("head")[0].appendChild(script);
}());
