/**
 * Copyright (c) 2017 Sebastian Barwe
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

'use strict'

const compile = require('built-in-math-eval')
const mustache = require('mustache')

/**
 * Custom Mustache Context capable to resolve message property and node
 * flow and global context
 */
function NodeContext(msg, nodeContext, parent) {
  this.msgContext = new mustache.Context(msg, parent)
  this.nodeContext = nodeContext
}

NodeContext.prototype = new mustache.Context()

NodeContext.prototype.lookup = function(name) {
  // try message first:
  try {
    var value = this.msgContext.lookup(name)
    if (value !== undefined) {
      return value
    }

    // try node context:
    var dot = name.indexOf('.')
    if (dot > 0) {
      var contextName = name.substr(0, dot)
      var variableName = name.substr(dot + 1)

      if (contextName === 'flow' && this.nodeContext.flow) {
        return this.nodeContext.flow.get(variableName)
      } else if (contextName === 'global' && this.nodeContext.global) {
        return this.nodeContext.global.get(variableName)
      }
    }
  } catch (err) {
    throw err
  }
}

NodeContext.prototype.push = function push(view) {
  return new NodeContext(view, this.nodeContext, this.msgContext)
}

module.exports = function(RED) {
  'use strict'
  function nodeCurve(config) {
    // get config
    this.fexpression = config.fexpression
    this.outputtype = config.outputtype || null // float = as is Float, floor = Floored integer, ceil =  Ceiled integer
    if (this.outputtype == 'float') this.outputtype = null
    this.valuex = config.valuex || null // use msg.payload per default for x value

    // this.xrange_start = config.xrangestart || Infinity;
    // this.xrange_end = config.xrangeend || Infinity;
    // this.inf = config.infinite || false;
    this.name = config.name || ''
    this.topic = config.topic || '' // NB: will be overwritten by msg.topic if recived

    this.useMustache = /{{/.test(this.fexpression)
    if (!this.useMustache) this.f = compile(this.fexpression)
    const node = this

    // Create the node instance
    RED.nodes.createNode(this, config)

    // handler function for node input events (when a node instance receives a msg)
    function nodeInputHandler(msg) {
      try {
        // TODO: should fine grain error handling here
        // If msg is null, nothing will be sent, add config.topic if needed
        if (msg !== null) {
          if (typeof msg !== 'object') {
            // Force msg to be an object with payload of original msg
            msg = { payload: msg }
          }
          // Add topic from node config if present and not present in msg
          if (!msg.hasOwnProperty('topic') || msg.topic === '') {
            if (node.topic !== '') msg.topic = node.topic
          }

          if (node.valuex) {
            msg.payload = RED.util.getMessageProperty(msg, node.valuex)
          }

          let x = parseFloat(msg.payload)

          /*
          // if out of range then send a not valid result
          if (
            node.xrange_start < node.xrange_end &&
            ((node.xrange_start != Infinity &&
              x < node.xrange_start) ||
              (node.xrange_end != Infinity && x > node.xrange_end))
          ) {
            // if not looped then return NaN if  out if range
            if (!node.inf) {
              msg.payload = NaN;
              node.send(msg);
              return;
            } else
              msg.payload =
                node.xrange_start +
                x % (node.xrange_end - node.xrange_start);
          }
          */

          if (msg.function === undefined && !node.useMustache) {
            msg.payload = node.f.eval({ x: x })
            if (isNaN(msg.payload))
              throw Error(
                'Result is not a number. Check function expression or x value. This often happens when calculating with absolute timestamps.'
              )
          } else {
            let fexpression = msg.function ? msg.function : node.fexpression

            if (/{{/.test(this.fexpression))
              fexpression = mustache.render(
                fexpression,
                new NodeContext(msg, node.context())
              )

            let f = compile(fexpression)
            msg.payload = f.eval({ x: x })
          }

          if (node.outputtype) {
            // do we need to floor or ceil
            msg.payload = node.outputtype == 'floor'
              ? Math.floor(msg.payload)
              : Math.ceil(msg.payload)
          }

          node.send(msg)
        }
      } catch (err) {
        node.error(err.message, msg)
      }
    } // -- end of msg recieved processing -- //

    node.on('input', nodeInputHandler)

    node.on('close', function() {
      node.removeListener('input', nodeInputHandler)
    })
  } // ---- End of nodeCurve (initialised node instance) ---- //

  RED.nodes.registerType('curve', nodeCurve)

  RED.httpAdmin.get('/node-red-contrib-curve/function-plot.min.js', function(
    req,
    res
  ) {
    var options = {
      root: __dirname,
      dotfiles: 'deny'
    }

    res.sendFile('function-plot.min.js', options)
  })
}

// EOF
