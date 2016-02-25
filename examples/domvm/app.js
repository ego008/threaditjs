T.time("Setup");

// mutation observer that'll reduce appVm.redraw() boilerplate
var w = domvm.watch(function(e) {
	appVm.redraw();
});

// separate noop observer to use its ajax helpers without redraw
var w0 = domvm.watch();

// model/state/api
function ThreaditApp() {
	this.threads	= w.prop([]);
	this.comments	= w.prop([]);
	this.error		= w.prop(null);

	this._onErr = function(err) {
		this.error(err.message);
	}.bind(this);
}

ThreaditApp.prototype = {
	newThread: function(text, cb) {
		var onOk = function(resp) { this.threads().push(resp.data); cb && cb(); }.bind(this);
		return w.post(T.apiUrl + "/threads/create", {text: text}, [onOk, this._onErr]);
	},
	newComment: function(parent, text, cb) {
		var onOk = function(resp) { parent.children.push(resp.data); cb && cb(); };
		return w0.post(T.apiUrl + "/comments/create", {text : text, parent: parent.id}, [onOk, this._onErr]);
	},
	getThreads: function(initial) {
		!initial && this.threads([]);
		var onOk = function(resp) { this.threads(resp.data); }.bind(this);
	//	T.timeEnd("Setup");
		return w.get(T.apiUrl + "/threads/", [onOk, this._onErr]);
	},
	getComments: function(id, initial) {
		!initial && this.comments([]);
		var onOk = function(resp) { this.comments(T.transformResponse(resp)); }.bind(this);
	//	T.timeEnd("Setup");
		w.get(T.apiUrl + "/comments/" + id, [onOk, this._onErr]);
	},
};

function ThreaditView(vm, imp) {
	return function() {
		var route = imp.router.current();

		return [".body",
			["p.head_links",
				["a", {href: "https://github.com/koglerjs/threaditjs/tree/master/examples/domvm"}, "Source"],
				" | ",
				["a", {href: "http://threaditjs.com"}, "ThreaditJS Home"]
			],
			["h2",
				["a", {href: "http://domvm.threaditjs.com"}, "ThreaditJS: domvm"]
			],
			[".main",
			 	imp.app.error() ?
			 	["p", ["strong", "Server's angry! "], imp.app.error]
			 	: route.name == "threadList"
			 	? [ThreadListView, imp.app.threads, null, imp]
			 	: route.name == "thread"
			 	? [ThreadBranchView, imp.app.comments().root, null, imp]
			 	: null,
			]
		]
	}
}

function ThreadListView(vm, threads, key, imp) {
	var submitting = false;

	// sub-template
	function threadListItemTpl(thread) {
		return [
			["p",
				["a", {href: imp.router.href("thread", [thread.id])}, T.trimTitle(thread.text)]			//	r.goto("comment", [5]);
			],
			["p.comment_count", thread.comment_count + " comment" + (thread.comment_count !== 1 ? "s" : "")],
			["hr"],
		]
	}

	function newThread(e) {
		submitting = true;
		vm.redraw();

		imp.app.newThread(vm.refs.text.el.value, function() {
			submitting = false;
		});

		return false;
	}

	return function() {
		return [".thread_list",
			!threads().length
				? ["p", {style: {marginBottom: 20, fontWeight: "bold"}}, "Loading threads..."]
				: threads().map(threadListItemTpl),
			submitting
			? ["p", {style: {fontWeight: "bold"}}, "Submitting thread..."]
			: ["form",  {onsubmit: newThread},
				["textarea", {_ref: "text"}],
				["input", {type: "submit", value: "Post!"}]
			]
		];
	}
}

// sub-view (will be used recursively)
function ThreadBranchView(vm, comment, key, imp) {
	return function() {
		return [".comment",
			!comment
			? ["p", {style: {marginBottom: 20, fontWeight: "bold"}}, "Loading thread " + imp.router.current().params[0] + "..."]
			: [
				["p", {_raw: true}, comment.text],
				[CommentReplyView, comment, null, imp],
				[".children", comment.children.map(function(comment2) {
					return [ThreadBranchView, comment2, null, imp];
				})]
			]
		];
	}
}

// sub-sub view
function CommentReplyView(vm, comment) {
	var replying = false;
	var submitting = false;
	var tmpComment = "";

	function toggleReplyMode(e) {
		replying = !replying;
		vm.redraw();
		return false;
	}

	function newComment(e) {
		submitting = true;
		replying = false;
		vm.redraw();

		vm.imp.app.newComment(comment, tmpComment, function() {
			submitting = false;
			vm.redraw(1);	// redraw parent
		});

		return false;
	}

	function previewReply(e) {
		tmpComment = e.target.value;
		vm.redraw();
	}

	return function() {
		return [".reply",
			submitting
			? ["p", {style: {fontWeight: "bold"}}, "Submitting reply..."]
			: replying
			? ["form", {onsubmit: newComment},
				["textarea", {
					value: tmpComment,
					onkeyup: previewReply,
				}],
				["input", {type: "submit", value: "Reply!"}],
				[".preview", {_raw: true}, T.previewComment(tmpComment)],
			]
			:
			["a", { href: "#", onclick: toggleReplyMode }, "Reply!"]
		];
	}
};

function ThreaditRouter(rt, imp) {
	var titlePre = "ThreaditjS: domvm | ";
	var routePre = "";

	return {
		threadList: {
			path: routePre + "/",
			onenter: function(e) {
				document.title = titlePre + "Thread List";
				imp.app.getThreads(!e.from);
			},
		},
		thread: {
			path: routePre + "/thread/:id",
			params: {id: /[a-zA-Z0-9]{5,7}/},
			onenter: function(e, id) {
				document.title = titlePre + "Thread #" + id;
				imp.app.getComments(id, !e.from);
			},
		},
//		_noMatch: {
//			path: "/404",
//		}
	};
}

var app = new ThreaditApp();

// router uses app to invoke api/fetch calls on history changes
var router = domvm.route(ThreaditRouter, {app: app});

var opts = { hooks: { didMount: function() { T.timeEnd("Setup"); } } };

// our view uses app for render and router to construct hrefs for links
var appVm = domvm.view(ThreaditView, {app: app, router: router}, null, null, opts).mount(document.body);

// add follow-up redraw timer
appVm.hook({
	willRedraw: function() { T.time("Full redraw()"); },
	didRedraw: function() { T.timeEnd("Full redraw()"); },
});

router.refresh();