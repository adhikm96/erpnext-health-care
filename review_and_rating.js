frappe.ui.form.on("Review And Rating", "on_submit", function(frm,cdt,cdn) {	
	var p = frm.doc;
	var rating = 0;

	if(p.review_to == "Supplier"){
		addRating("Supplier");
	}else if(p.review_to == "Customer"){
		addRating("Customer");
	}

	function addRating(doc){
		frappe.call({
			"method": "frappe.client.get_list",
			args: {
				doctype: "Review And Rating",
				fields: ['score'],
				filters: {
					reviewee: p.reviewee,
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
						"name": p.reviewee,
						"fieldname":{ 
							"custom_aggregate_score": flt(rating/data.message.length).toFixed(1)			
						},
					  }
				}); 
			}
		});
	}
});