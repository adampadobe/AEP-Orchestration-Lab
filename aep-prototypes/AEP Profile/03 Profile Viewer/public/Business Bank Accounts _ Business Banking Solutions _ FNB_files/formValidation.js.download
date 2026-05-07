var parts = parts || {};
parts.d = Math.floor((Math.random() * 100) + 1);

validationStat = false;
var theFormName, theDestination;

function validationSuccess(token, event) {
	submitForm(theFormName, event, theDestination);

	validationStat = true;
	$('#submitBtn').addClass('disabled');
	$('#'+theDestination).addClass("loading");
}

function validateAndSubmit(formName, event, destination, formType) {
	var isFormValid = true;

	switch (formType) {
	case "calculator":
		$("#command").val("calculate");
		isFormValid = validateGLForm(formName);
		break;
	case "tracker":
		$("#command").val("track");
		isFormValid = validateGLForm(formName);
		break;
	case "clear":
		$("#command").val("");
		break;
	case "evaluate":
		$("#command").val("EVALUATE");
		isFormValid = validateGLForm(formName);
		break;
	default:
		isFormValid = validateGLForm(formName);
		break;
	}


	if (isFormValid) {
		if (validationStat === true) {return false;} 
		//store form name and destination 
		theFormName = formName;
		theDestination = destination;
		//if recaptcha exists
		if(typeof grecaptcha !== 'undefined'){
			grecaptcha.execute();
		} else {
			validationSuccess('',event);
		}
		
	} else {
		//console.info("Form is invalid.")
		$(".validationError").get(0).scrollIntoView();
	}
};
function serverSideValidation(errors) {
	showWrapper = false;
	
	var err = JSON.parse(errors);
	
	if(err.length > 0){
		//reload / re-init captcha
	}
	
    for(var i = 0; i < err.length; i++) {
    	//Check if field is on the page.
    	var field = $("#"+err[i].key);
    	if (field.length > 0) {
    		//Set the validation message
    		$("#"+err[i].key).closest(".validationWrapper").find(".inlineErrorText").html(err[i].value);
    		//Set validtion error class
    		$("#"+err[i].key).closest(".validationWrapper").addClass('validationError');
    	}
    	else {
//    		$(errWrapper[0]).append("<div><b>Errors:</b></div>")
//    		$(errWrapper[0]).append(err[i].key +" : "+ err[i].value);
    		//console.info("show error bar");
    		showWrapper = true;
    	}
    }
	
    if (showWrapper) {
    	//console.info("show error bar");
    }
    else {
    	var target = $("#"+err[0].key);
        if (target.length) {
          $('body').animate({
            scrollTop: target.offset().top
          }, 0);
          return false;
        }
    }
	
	return false;

};
function validateGLForm(formName) {
	var isFormValid = true;
	$('.validationWrapper').removeClass("validationError");

	$("#"+formName+" .glRequired").each(function() {
		if ( $(this).is(':visible') ) {
			if (($(this).val() == "") | ($(this).val() == 0)) {
				var parent = $(this).closest('.validationWrapper');
				$(parent).addClass("validationError");
				isFormValid = false;
			}
		} else {
			//DO NOTHING
		}
	});

	$("#"+formName+" .glNumber").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				var parent = $(this).closest('.validationWrapper');
				if (!glIsNumber(_thisValue)) {
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" [data-minValue]").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			var _thisMinValue = $(this).attr("data-minValue");
			if (parseFloat(_thisValue) < parseFloat(_thisMinValue)) {
				var parent = $(this).closest('.validationWrapper');
				$(parent).addClass("validationError");
				isFormValid = false;
			}
		}
	});
	$("#"+formName+" [data-maxValue]").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			var _thisMaxValue = $(this).attr("data-maxValue");
			if (parseFloat(_thisValue) > parseFloat(_thisMaxValue)) {
				var parent = $(this).closest('.validationWrapper');
				$(parent).addClass("validationError");
				isFormValid = false;
			}
		}
	});

	$("#"+formName+" .glAlpha").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsAlpha(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glAlphaNumeric").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsAlpha(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glEmail").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsEmail(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glTelephoneNumber").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsTelephone(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glInternationalTelephoneNumber").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			var _thisMaxLength = $(this).attr("data-maxlength");
			var _thisCodes = ($(this).attr("data-codes"));
			if (_thisValue != "") {
			if (!glIsTelephoneLength(_thisValue,_thisMaxLength,_thisCodes)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});	
	$("#"+formName+" .glDate").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsDate(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glCurrency").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsCurrency(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glRate").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsRate(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glDecimal").each(function() {
		if ( $(this).is(':visible') ) {
			var _thisValue = $(this).val();
			if (_thisValue != "") {
				if (!glIsDecimal(_thisValue)) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			}
		}
	});
	$("#"+formName+" .glRadioButton.glRequired").each(function() {
		if ( $(this).is(':visible') ) {
			valLabelId = valLabelId.replace("groupDiv_", "");
			$(this).each(function() {
				if ($('.selected').size() == 0) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			});
		}
	});
	$("#"+formName+" .glDropDown.glRequired").each(function() {
		if ( $(this).is(':visible') ) {
			valLabelId = valLabelId.replace("ddlDiv_", "");
			$(this).each(function() {
				if ($('.ui2-dropDownItem.selected').size() == 0) {
					var parent = $(this).closest('.validationWrapper');
					$(parent).addClass("validationError");
					isFormValid = false;
				}
			});
		}
	});
	$("#"+formName+" .glCheckBoxRequired").each(function() {
			if (!$(this).is(":checked")) {
				var parent = $(this).closest('.validationWrapper');
				$(parent).addClass("validationError");
				isFormValid = false;
			}
	});
	return isFormValid;
};
function glIsCurrency(_input) {
	var _pattern = new RegExp("^[0-9,]*\.[0-9][0-9]$|^[0-9]*$");
	return (_pattern.test(_input));
};
function glIsRate(_input) {
	var _pattern = new RegExp("^[0-9\.]+$");
	return (_pattern.test(_input));
};
function glIsDecimal(_input) {
	var _pattern = new RegExp("^[0-9,]*\.[0-9]*$|^[0-9]*$");
	return (_pattern.test(_input));
};
function glIsNumber(_input) {
	var _pattern = new RegExp("^[0-9]*$");
	return (_pattern.test(_input));
};
function glIsAlphaNumeric(_input) {
	var _pattern = new RegExp("[a-zA-Z0-9\s]+");
	return (_pattern.test(_input));
};
function glIsAlpha(_input) {
	var _pattern = new RegExp("[a-zA-Z\-'\s]+");
	return (_pattern.test(_input));
};
function glIsEmail(_emailAddress) {
	var _pattern = new RegExp(
			"[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?");
	return (_pattern.test(_emailAddress));
};
function glIsTelephone(_telNumber) {
	var _pattern = new RegExp("^[0-9]+$");
	return (_pattern.test(_telNumber));
};
function glIsTelephoneLength(_telNumber,_telMaxLength,_telCodes) {
	var maxLength;
	var telephoneCodes = _telCodes;
	if(parseInt(_telMaxLength) < 1)
		{maxLength = "0,15"}
	else
		{maxLength = _telMaxLength}
	if (typeof(telephoneCodes) === 'undefined')
		{telephoneCodes = "";}
	var _patternLength = new RegExp("^[0-9]{"+maxLength+"}$");
	var _patternCode = new RegExp("^(0)("+telephoneCodes+")(\\d*)$");
	if(_patternLength.test(_telNumber) && _patternCode.test(_telNumber))
		{return true;}
	else
		{return false;}
};
function glIsDate(_date) {
	var _pattern = new RegExp(
			"^[0-9]{4}-(((0[13578]|(10|12))-(0[1-9]|[1-2][0-9]|3[0-1]))|(02-(0[1-9]|[1-2][0-9]))|((0[469]|11)-(0[1-9]|[1-2][0-9]|30)))$");
	return (_pattern.test(_date));
}
var loader = $.get("/00Assets/v2.2/images/global/ajax-loader.gif?r=" + parts.d);


function addComma(n) {
  n = n.toString()
  while (true) {
    var n2 = n.replace(/(\d)(\d{3})($|,|\.)/g, '$1,$2$3');
    if (n == n2) break;
    n = n2;
  }
  return n
}

function formatToCurrency(x) {
  retVal = x ? parseFloat(x.replace(/,/g, '')) : 0;
  return retVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function currencyKeypress(event, x) {
	if (event.which == 47 || event.which == 45) event.preventDefault();
	if ((event.which != 46 || $(x).val().indexOf('.') != -1) && (event.which < 44 || event.which > 59)) {
		event.preventDefault();
	}
}
function unformatCurrency(x) {
	currentVal = $(x).val();
	$(x).val(currentVal.replace(/,/g, ''));
}
function currencyBlur(x) {
	var inputVal = $(x).val();
	var inputVal = formatToCurrency(inputVal);
	
	inputVal = inputVal.replace(/,/g, '');
	inputVal = parseFloat(inputVal).toFixed(2);
	
	inputVal = addComma(inputVal);
	$(x).val(inputVal);
}

function addClientSideValidation() {
	$(".glCurrency").on('blur', function (){
		currencyBlur(this);
	});
	
	$(".glCurrency").on('focus', function (){
		unformatCurrency(this);
	});
	
	$('.glCurrency').keypress(function(event) {
		currencyKeypress(event, this);
	});
}
