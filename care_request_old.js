frappe.ui.form.on("Care Request", "add_custom_activity", function(frm,cdt,cdn) {	
	var p = frm.doc;
	var nrow = frm.add_child("activity_logs");
	nrow.activity = "Custom";
	nrow.timestamp = frappe.datetime.now_datetime();
	refresh_field("activity_logs");
});


frappe.ui.form.on('Care Request', {
    before_workflow_action: async (frm) => {
		var p = frm.doc;

        let promise = new Promise((primary_action, reject) => {
			switch(frm.selected_workflow_action){
				case "Start":
					addActivity("Started");
					break;
				case "Pause":
					addActivity("Paused");
					break;
				case "End":
					addActivity("Ended");
					break;
				default:
					reject("No acitivity");
					break;
			}
		
			var longitude = 0;
			var latitude = 0;

			function addActivity(activity){		
				frappe.dom.unfreeze()
				let d = new frappe.ui.Dialog({
					title: 'Select Date and Time',
					fields: [
						{
							label: 'Timestamp',
							fieldname: 'timestamp',
							fieldtype: 'Datetime',
							default: frappe.datetime.now_datetime() 
							}
					],
					size: 'small', // small, large, extra-large 
					primary_action_label: 'Submit',
					primary_action(values) {
						var nrow = frm.add_child("activity_logs");
						nrow.activity = activity;
						nrow.timestamp = values.timestamp;

						if (navigator.geolocation){
							navigator.geolocation.getCurrentPosition(addPosition);
							if(longitude != 0 && latitude != 0){
								var location = '{"type": "FeatureCollection","features": [{"type": "Feature","properties": {},"geometry": {"type": "Point","coordinates": [ ' + longitude + ',' + latitude + ']}}]}';
								nrow.geolocation = location;
								latitude = 0;
								longitude = 0;
							}
						}

						if(activity == "Paused" || activity == "Ended"){
							if(p.request_type == "Hourly"){
								calculdateHours(p);
								calculateAmount(p);
							}else if(p.request_type == "Daily" && activity == "Ended"){
								calculdateDays(p);
								calculateAmount(p);
							}
		
						}

						d.hide();

						p.workflow_state = activity;		
						refresh_field("activity_logs");
						cur_frm.save('Update');

						setTimeout(() => frappe.msgprint("Care Request is  " + activity + "." ), 1000);

					}
				});
				
				d.show();
			}
		
			function addPosition(position) {
				latitude = position.coords.latitude;
				longitude = position.coords.longitude;
			  }
			
        });

        await promise.catch((e) => { console.log(e)}); // If the promise is rejected, throw an error
    },
});

frappe.ui.form.on("Care Request", "after_workflow_action", function(frm,cdt,cdn) {	
	var p = frm.doc;

	switch(p.workflow_state){
		case "New":
			addActivity("New");
			break;
		case "Scheduled":
			addActivity("Scheduled");
			break;
		case "Cancelled":
			addActivity("Cancelled");
			break;
		case "Closed":
			frappe.msgprint("Care Request is closed.");
			createPurchaseInvoice();
			break;
	}

	var longitude = 0;
	var latitude = 0;

	function addActivity(activity){
		var nrow = frm.add_child("activity_logs");
		nrow.activity = activity;
		nrow.timestamp = frappe.datetime.now_datetime();

		if (navigator.geolocation){
			navigator.geolocation.getCurrentPosition(addPosition);
			if(longitude != 0 && latitude != 0){
				var location = '{"type": "FeatureCollection","features": [{"type": "Feature","properties": {},"geometry": {"type": "Point","coordinates": [ ' + longitude + ',' + latitude + ']}}]}';
				nrow.geolocation = location;
				latitude = 0;
				longitude = 0;
			}
		}

		refresh_field("activity_logs");
		cur_frm.save('Update');

		setTimeout(() => frappe.msgprint("Care Request is  " + activity + "." ), 1000);
	}

	function addPosition(position) {
		latitude = position.coords.latitude;
		longitude = position.coords.longitude;
	  }

	function createPurchaseInvoice(){
		var r = [];
		r[0] = {
			"item_code": p.item,
			"qty": 1,
			"rate": p.amount,
			"amount":p.amount
		};

		for(var ai=0;ai<p.additional_items.length;ai++){
			r[ai+1] = {
				"item_code": p.additional_items[ai].item,
				"qty": 1,
				"rate": p.additional_items[ai].amount,
				"amount":p.additional_items[ai].amount
			};
		}

		frappe.call({
			"method": "frappe.client.insert",
			args: {
				doc: {
					doctype: "Purchase Invoice",
					"supplier": p.supplier,
					"items": r
				}
			},
			async: false,
			callback: function(data) {
				frappe.model.set_value(p.doctype, p.name, "purchase_invoice", data.message.name);
				cur_frm.save('Update');
				frappe.call({
					"method": "frappe.client.submit",
					args: {
						doc: data.message
					},
					freeze: true,
                    async: false,
					callback: function(res) {
						setTimeout(() => frappe.msgprint("New Purchase Invoice is created." ), 2000);
					}
				});
			}
		});
	}
});

function calculdateDays(p){
	var daysSpend = 0;
	var started = null;

	for(var l=0;l<p.activity_logs.length;l++){
		if(p.activity_logs[l].activity == "Started"){
			started = p.activity_logs[l].timestamp;
		}else if(p.activity_logs[l].activity == "Ended" && started != null){
			daysSpend = frappe.datetime.get_diff(p.activity_logs[l].timestamp, started);
		}
	}

	if(daysSpend != 0){
		frappe.model.set_value(p.doctype, p.name, "days_consumed", daysSpend);
	}
}

function calculdateHours(p){
	var timeSpend = 0;
	var started = null;
	for(var l=0;l<p.activity_logs.length;l++){
		if(p.activity_logs[l].activity == "Started"){
			started = p.activity_logs[l].timestamp;
		}else if(p.activity_logs[l].activity == "Paused" && started != null){
			timeSpend = timeSpend + frappe.datetime.get_minute_diff(p.activity_logs[l].timestamp, started);
			started = null;
		}else if(p.activity_logs[l].activity == "Ended" && started != null){
			timeSpend = timeSpend + frappe.datetime.get_minute_diff(p.activity_logs[l].timestamp, started);
			started = null;
		}
	}

	var mins = (timeSpend%60)/100;

	if(timeSpend > 60){
		var hours = Math.floor(timeSpend/60);
		frappe.model.set_value(p.doctype, p.name, "hours_consumed", hours+mins);
	}else{
		frappe.model.set_value(p.doctype, p.name, "hours_consumed", mins);
	}
}

frappe.ui.form.on("Additional Item", "amount", function(frm,cdt,cdn) {	
	var p = frm.doc;
	var total = 0;
	for(var i=0;i <p.additional_items.length;i++){
		total = total + flt(p.additional_items[i].amount);
	}
	frappe.model.set_value(p.doctype, p.name, "additional_amount", total);
});

frappe.ui.form.on("Care Request", "refresh", function(frm,cdt,cdn) {	
	var p = frm.doc;

	function addRating(doc, reviewee){
		var rating = 0;
		frappe.call({
			"method": "frappe.client.get_list",
			args: {
				doctype: "Review And Rating",
				fields: ['score'],
				filters: {
					reviewee: reviewee,
					docstatus:1
				}
			},
			async: false,
			callback: function(data){
				for(var i=0;i<data.message.length;i++){
					rating = rating + data.message[i].score;
				}			
				frappe.call({
					"method": "frappe.client.set_value",
					"args": {
						"doctype": doc,
						"name": reviewee,
						"fieldname":{ 
							"custom_aggregate_score": flt(rating/data.message.length).toFixed(1)			
						},
					  },
					  freeze: true,
					  callback: function() {
						frappe.msgprint("Review submitted." );
						setTimeout(() => location.reload(), 1000);
					}
				}); 
			}
		});
	}

	if(p.workflow_state == "Closed"){
		frappe.call({
			"method": "frappe.client.get_list",
			args: {
				doctype: "Review And Rating",
				fields: ['name'],
				filters: {
					reviewee: p.supplier,
					care_request: p.name
				}
			},
			async: false,
			callback: function(data){
				if(data.message.length == 0){
					frm.add_custom_button(__('To Supplier'), function(){
						frappe.prompt([{
							label: 'Score',
							fieldname: 'score',
							fieldtype: 'Int',
							description: 'Note: 1-5' 
							},
							{
								label: 'Notes',
								fieldname: 'notes',
								fieldtype: 'Small Text'
							}		
						],(values) => {
							frappe.call({
								"method": "frappe.client.insert",
								args: {
									doc: {
										doctype: "Review And Rating",
										"score": values.score,
										"notes": values.notes,
										"review_from": "Customer",
										"reviewer":  p.customer, 
										"care_request": p.name,
										"review_to": "Supplier",
										"reviewee": p.supplier
									}
								},
								async: false,
								callback: function(data) {
									frappe.call({
										"method": "frappe.client.submit",
										args: {
											doc: data.message
										},
										freeze: true,
										async: false,
										callback: function(res) {
											addRating("Supplier", p.supplier);
										}
									});
								}
							});
						});
					}, __("Reviews"));
				}
			}
		});

		frappe.call({
			"method": "frappe.client.get_list",
			args: {
				doctype: "Review And Rating",
				fields: ['name'],
				filters: {
					reviewee: p.customer,
					care_request: p.name
				}
			},
			async: false,
			callback: function(data){
				if(data.message.length == 0){
					frm.add_custom_button(__('To Customer'), function(){
						frappe.prompt([{
							label: 'Score',
							fieldname: 'score',
							fieldtype: 'Int',
							description: 'Note: 1-5' 
							},
							{
								label: 'Notes',
								fieldname: 'notes',
								fieldtype: 'Small Text'
							}		
						],(values) => {
							frappe.call({
								"method": "frappe.client.insert",
								args: {
									doc: {
										doctype: "Review And Rating",
										"score": values.score,
										"notes": values.notes,
										"review_from": "Supplier",
										"reviewer":  p.supplier, 
										"care_request": p.name,
										"review_to": "Customer",
										"reviewee": p.customer
									}
								},
								async: false,
								callback: function(data) {
									frappe.call({
										"method": "frappe.client.submit",
										args: {
											doc: data.message
										},
										freeze: true,
										async: false,
										callback: function(res) {
											addRating("Customer", p.customer);
										}
									});
								}
							});
						});
					}, __("Reviews"));
				}
			}
		});
	}

	if(p.workflow_state == "New" && !p.supplier){

		setTimeout(() => 
		frappe.prompt([{
			label: 'Supplier',
			fieldname: 'supplier',
			fieldtype: 'Link',
			options: 'Supplier' 
			},
			{
				label: 'Request Type',
				fieldname: 'request_type',
				fieldtype: 'Select',
				options: '\nHourly\nDaily\nLumpsum' 
			},
			{
				label: 'Lumpsum/Rate',
				fieldname: 'lumpsumrate',
				fieldtype: 'Currency'
			},
		
		],(values) => {
			frappe.model.set_value(p.doctype, p.name, "supplier", values.supplier);
			frappe.model.set_value(p.doctype, p.name, "request_type", values.request_type);
			if(values.lumpsumrate == 0){
				setLumpsumRate(p);
			}else{
				frappe.model.set_value(p.doctype, p.name, "lumpsumrate", values.lumpsumrate);
				calculateAmount(p);
			}
			
			cur_frm.save('Update');
			location.reload();
		}, __("Add Supplier Details"))
		, 1000);
	}
});

frappe.ui.form.on("Care Request", "hours_consumed", function(frm,cdt,cdn) {	
	var p = frm.doc;
	if(p.hours_consumed%1 > 0.60){
		frappe.throw("Please enter minutes under 60 !");
	}
	if(p.hours_consumed > 1){
		var mins = p.hours_consumed%1;
		var hours = Math.floor(p.hours_consumed);
		//price = (Math.ceil(p.hours_consumed * 2) / 2 ) * data.message.custom_services_offered[i].price; 
		frappe.model.set_value(p.doctype, p.name, "amount", hours * p.lumpsumrate + (p.lumpsumrate/60) * (mins * 100));
	}else{
		frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate);
	}
});

frappe.ui.form.on("Care Request", "days_consumed", function(frm,cdt,cdn) {	
	var p = frm.doc;
	if(p.days_consumed < 1){
		frappe.throw("Please enter atleast one day");
	}

	if(p.days_consumed > 1){
		frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate * p.days_consumed);
	}else{
		frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate);
	}
});


frappe.ui.form.on("Care Request", "request_type", function(frm,cdt,cdn) {	
	var p = frm.doc;

	if(p.request_type == ""){
		frappe.model.set_value(p.doctype, p.name, "lumpsumrate", 0);
		frappe.model.set_value(p.doctype, p.name, "amount", 0);
	}

	setLumpsumRate(p);
});

function setLumpsumRate(p){
	frappe.call({
		"method": "frappe.client.get",
		args: {
			doctype: "Supplier",
			filters: {
			name:["=", p.supplier]
			}
		},
		async: false,
		callback: function(data){
			frappe.model.set_value(p.doctype, p.name, "lumpsumrate", 0);
			for(var i=0;i<data.message.custom_services_offered.length;i++){
				if(data.message.custom_services_offered[i].charge == p.request_type){
					frappe.model.set_value(p.doctype, p.name, "lumpsumrate", data.message.custom_services_offered[i].price);
				}
			}
		}
	});
}

frappe.ui.form.on("Care Request Activity Log", "timestamp", function(frm,cdt,cdn) {	
	var p = frm.doc;
	if(p.request_type == "Hourly"){
		calculdateHours(p);
		calculateAmount(p);
	}else if(p.request_type == "Daily"){
		calculdateDays(p);
		calculateAmount(p);
	}	
});

frappe.ui.form.on("Care Request", "lumpsumrate", function(frm,cdt,cdn) {	
	var p = frm.doc;
	calculateAmount(p);
});

function calculateAmount(p){
	if(p.request_type == "Lumpsum"){
		frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate);
	}else if(p.request_type == "Hourly"){
		if(p.hours_consumed > 1){
			var mins = p.hours_consumed%1;
			var hours = Math.floor(p.hours_consumed);
			//price = (Math.ceil(p.hours_consumed * 2) / 2 ) * data.message.custom_services_offered[i].price; 
			frappe.model.set_value(p.doctype, p.name, "amount", hours * p.lumpsumrate + (p.lumpsumrate/60) * (mins * 100));
		}else if(p.hours_consumed != 0){
			frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate);
		}else{
			frappe.model.set_value(p.doctype, p.name, "amount", 0);	
		}
	}else if(p.request_type == "Daily"){
		if(p.days_consumed > 1){
			frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate * p.days_consumed);
		}else{
			frappe.model.set_value(p.doctype, p.name, "amount", p.lumpsumrate);
		}
	}
}