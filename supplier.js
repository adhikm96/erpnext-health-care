frappe.ui.form.on("Supplier", "before_save", function(frm,cdt,cdn) {	
	var p = frm.doc;

	if(p.custom_docs.length == 0){
		var nrow1 = frm.add_child("custom_docs");
		nrow1.document_type = "Address Proof";
		var nrow2 = frm.add_child("custom_docs");
		nrow2.document_type = "ID Proof";
		var nrow3 = frm.add_child("custom_docs");
		nrow3.document_type = "PAN";
		var nrow4 = frm.add_child("custom_docs");
		nrow4.document_type = "Aadhar";
	}
});

frappe.ui.form.on("Supplier", "before_workflow_action", function(frm,cdt,cdn) {	
	var p = frm.doc;

	if(frm.selected_workflow_action == "Approve"){
		for(var i=0;i <p.custom_docs.length;i++){
			if(p.custom_docs[i].verified == false){
				frappe.throw("Please verify all KYC documents!");
			}
		}	
	}
	
	if(frm.selected_workflow_action == "Reject"){
		for(var j=0;j <p.custom_docs.length;j++){
			if(p.custom_docs[j].verified == true){
				frappe.throw("All KYC documents are verified, cannot reject it!");
			}
		}	
	}
});
