/*
    neo4j examples
--------------------------------------------
    var gurl = "http://localhost:7474";

    -- create node --
    =================
    neo4j.node({ name: 'John' }).adapter.load(gurl).done(function(data){
        // created 
    });
    creates node as: { name: 'John' }

    -- create relationship --
    =========================
    neo4j.rel(0, "LOVES", { to: 1 }).adapter.load(gurl).done(function(data){
        // created 
    });
    creates relationship as: (0)-[:LOVES]->(1)

    -- create node with label --
    ============================
    neo4j.node({ name: 'John' }).label("Person").adapter.load(gurl).done(function(data){
        // created 
    });
    creates node as: { name: 'John' } with label 'Person'

    -- create all above in batch --
    ===============================
    neo4j.batch()
        .add("node", { name: 'John' })
        .add("label", "Person", "{0}") // apply label to '0' elem in batch
        .add("node", { name: 'Maria' })
        .add("label", "Person", "{2}") // apply label to '2' elem in batch
        .add("rel", "LOVES", "{0}", { to: "{2}" })  // apply label to '0' elem in batch
        .adapter.load(gurl).done(function(data){
            // created 
        });

    creates: (:Person{ name : 'John' })->[:LOVES]-(:Person{ name : 'Maria' })
*/

String.prototype.format = function () {
    var args = [];
    if (arguments.length == 1) args = arguments[0];
    else if (arguments.length > 1) {
        for (var i = 0; i < arguments.length; i++)
            args.push(arguments[i]);
    }
    if (!(args instanceof Array)) args = [args];
    var bits = this.split(/%s/g);
    var ret = [];
    for (var i = 0; i < bits.length - 1; i++) {
        ret.push(bits[i]);
        if (i < args.length) ret.push(args[i]);
    }
    ret.push(bits[i]);
    return ret.join('');
};

/*
   neo4j data loader
*/
var neo4j = {
    name: "neo4j",
    "loader": {}
};

// neo4j abstract object class
(function () {

    this.NObj = function () {

    };
    this.NObj.prototype.get = function (u) {
        return this.adapter().load(u);
    };
    this.NObj.prototype.create = function (u) {
        return this.adapter().load(u);
    };
    this.NObj.prototype.delete = function (u) {
        this.del = true;
        return this.adapter().load(u);
    };
    this.NObj.prototype.adapter = function () {
        return new neo4j.loader.Adapter(this.path(), this.method(), this.data());
    };
    this.NObj.prototype.path = function (path) {
        if (!path) return this._path;
        if (!this._path) this._path = "";
        this._path += path;
        return this._path;
    };
    this.NObj.prototype.method = function () {
        if (typeof this.obj == "number" || (typeof this.obj == "string" && this.obj[0] == "{")) {
            if (this.del) return "DELETE";
            return "GET";
        }
        return "POST"; // for create
    };
    this.NObj.prototype.data = function () {
        if (this.method() == "POST") return JSON.stringify(this.obj);
        return "{}";
    };
    this.NObj.prototype.b = function () { // get batch part of it
        return {
            method: this.method(),
            to: this.path(),
            body: this.obj
        };
    };
}).call(neo4j);

// cypher adapter
(function () {

    this.Query = function (query) {
        this.q = query;
        this.qargs = {};
    };
    this.Query.prototype.range = function (start, end) {
        this.skip(start).limit(end - start);
        return this;
    };
    this.Query.prototype.skip = function (val) {
        this.q += " skip " + val;
        return this;
    };
    this.Query.prototype.limit = function (val) {
        this.q += " limit " + val;
        return this;
    };
    this.Query.prototype.query = function () {
        var args = [];
        for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
        this.q = this.q.format(args);
        return this.q;
    };
    this.Query.prototype.args = function (args) {
        this.qargs = args;
        return this;
    };
    this.Query.prototype.adapter = function () {
        var data = JSON.stringify({
            "query": this.query.apply(this, arguments),
            "params": this.qargs != undefined ? this.qargs : {}
        });
        return new neo4j.loader.Adapter("/cypher", "POST", data);
    };

    this.query = function (query) {
        return new neo4j.Query(query);
    };
}).call(neo4j);

// node adapter
(function () {

    this.Node = function (path, node, del) { // node could be: { foo: bar }, 0
        this.obj = node;
        this.del = del;
        /* init */
        if (typeof this.obj == "string" && this.obj[0] == "{") // get by ref in batch {0}
            this.path((path ? path : "") + this.obj);
        else
            this.path((path ? path : "") + "/node");
        if (typeof this.obj == "number") // get node by id
            this.path("/" + this.obj);
    };
    // extend neo4j object
    this.Node.prototype = neo4j.NObj.prototype;
    this.Node.prototype.rels = function (rel, type, params) {
        params = neo4j.Rel.params(rel, type, params);
        return new neo4j.Rel(this.path(), params.rel, params.type, params.dir, undefined, params.to, params.del);
    };
    this.Node.prototype.label = function (obj, node, params) {
        params = neo4j.Label.params(obj, node, params);
        return new neo4j.Label(this.path(), params.label, undefined, params.del);
    };
    this.Node.params = function (params) {
        if (!params) params = {};
        params.del = typeof params.del == "undefined" ? false : params.del;
        return params;
    };
    this.node = function (node, params) {
        params = neo4j.Node.params(params);
        return new neo4j.Node(undefined, node, params.del);
    };
}).call(neo4j);

// label adapter
(function () {

    this.Label = function (path, label, node, del) { // label could be: "Actor", ["Actor", "Person"], undefined; node could be 0, undefined
        this.obj = label;
        this.del = del;
        this.node = node;
        /* init */
        if (typeof node == "number") {
            path = "/node/" + node;
        }
        if (typeof this.node == "string" && this.node[0] == "{") // get by ref in batch {0}
            this.path((path ? path : "") + this.node);
        if (this.path() || (!node && !label))
            this.path((path ? path : "") + "/labels");
        else
            this.path("/label");
    };
    // extend neo4j object
    this.Label.prototype = neo4j.NObj.prototype;
    this.Label.prototype.delete = function (u) {
        this.del = true;
        this.path("/" + this.obj);
        return this.adapter().load(u);
    };
    this.Label.params = function (obj, node, params) {
        var label = typeof obj == "string" || obj instanceof Array ? obj : undefined;
        var n = typeof obj == "number" ? obj : undefined;
        if (!n && (typeof node == "number" || (label && typeof node == "string"))) n = node; // if n is not set, then if node is number or label was passed node is string, {0}
        if (node && !n) params = node;
        if (!params) params = {};
        params.del = typeof params.del == "undefined" ? false : params.del;
        params.label = label;
        params.n = n;
        return params;
    };
    this.label = function (obj, node, params) {
        params = neo4j.Label.params(obj, node, params);
        return new neo4j.Label(undefined, params.label, params.n, params.del);
    };
}).call(neo4j);

// rel adapter
(function () {

    this.Rel = function (path, rel, type, dir, from, to, del) { // rel could be: { foo: bar }, 0, undefined; type could be LOVES, undefined; dir could be all, in, out
        this.obj = rel;
        this.del = del;
        this.dir = dir;
        this.from = from;
        this.to = to;
        this.type = type;
        /* init */
        if (typeof from == "number")
            this.path("/node/" + from);
        else if (typeof from == "string") // {0}
            this.path(from);
        else if (path)
            this.path(path);
        this.path(this.path() ? "/relationships" : "/relationship");
        if (typeof this.obj == "number") {// get rel by id
            this.path("/" + this.obj);
            this.obj = undefined; // its consumed
        }
        else if (to) { // rel is to be created
            var data = this.obj;
            this.obj = {
                type: this.type,
                to: neo4j.node(to).path()
            }
            if (data) this.obj.data = data;
        }
        else { // get or del by type
            this.path("/" + this.dir);
            if (this.type) this.path("/" + this.type);
        }
    };
    // extend neo4j object
    this.Rel.prototype = neo4j.NObj.prototype;
    this.Rel.params = function (rel, type, params) {
        if (typeof type != "string") { // 1 or 2 args are supplied
            if (typeof rel == "string" && rel[0] != "{") { // type is provided
                params = type;
                type = rel;
                rel = undefined;
            }
            else { // rel is provided
                params = type;
                type = undefined;
            }
        }
        if (!params) params = {};
        params.from = params.from ? params.from : undefined;
        params.to = params.to ? params.to : undefined;
        params.dir = params.dir ? params.dir : "all";
        params.del = typeof params.del == "undefined" ? false : params.del;
        params.rel = rel;
        params.type = type;
        return params;
    };
    this.rel = function (rel, type, params) {
        params = neo4j.Rel.params(rel, type, params);
        return new neo4j.Rel(undefined, params.rel, params.type, params.dir, params.from, params.to, params.del);
    };
}).call(neo4j);

// batch adapter
(function () {

    this.Batch = function (nObjs) {
        this.b = [];
        for (var i = 0; i < nObjs.length; i++) {
            this.addObj(nObjs[i]);
        }
    };
    this.Batch.prototype.add = function () {
        var func = undefined;
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
            if (i == 0) {
                func = neo4j[arguments[i]];
                continue;
            }
            args.push(arguments[i]);
        }
        this.addObj(func.apply(neo4j, args));
        return this;
    };
    this.Batch.prototype.addObj = function (nObj) {
        var b = nObj.b();
        b.id = this.b.length;
        this.b.push(b);
        return this;
    };
    this.Batch.prototype.adapter = function () {
        var data = JSON.stringify(this.b);
        //console.log('executing batch: \n%j', this.b);
        return new neo4j.loader.Adapter("/batch", "POST", data);
    };
    this.batch = function () {
        return new neo4j.Batch(arguments);
    };
}).call(neo4j);


// dataLoader
(function () {
    this.Adapter = function (path, method, data) {
        this.target = path;
        this.args = "";
        var header = [
            { key: "Content-Type", value: "application/json; charset=utf-8" }
        ];

        this.__req__ = {
            url: "/db/data" + path,
            type: method,
            data: data,
            beforeSend: function (xhr) {
                for (var i = 0; i < header.length; i++)
                    xhr.setRequestHeader(header[i].key, header[i].value);
            }
        };
    }
    this.Adapter.prototype.load = function (u) {
        this.__req__.url = u + this.__req__.url;
        this.__req__ = $.ajax(this.__req__);
        return this;
    }
    this.Adapter.prototype.done = function (callback) {
        this.__req__.done(callback);
        return this;
    }
    this.Adapter.prototype.fail = function (callback) {
        this.__req__.fail(callback);
        return this;
    }
    this.Adapter.prototype.always = function (callback) {
        this.__req__.always(callback);
        return this;
    }
    this.Adapter.prototype.unload = function () {
        return this;
    };
    this.Adapter.prototype.key = function () {
        return this.target + "|" + JSON.stringify(this.args) + "|neo4j.q";
    };
}).call(neo4j.loader);
