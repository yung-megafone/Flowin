// ==UserScript==
// @name     	ClipIt
// @namespace	Yung-Megafone
// @version  	1.3
// @description  Automagically copies the title and URL of a ticket for easy dissemination
// @author   	Brando <capto.brando@pm.me>
// @include  	http*://t.corp.amazon.com/*
// @run-at   	document-end
// @grant    	GM_setClipboard
// @updateURL	https://raw.githubusercontent.com/yung-megafone/FulfillmentFlow/refs/heads/main/scripts/ClipIt.user.js
// @downloadURL  https://raw.githubusercontent.com/yung-megafone/FulfillmentFlow/refs/heads/main/scripts/ClipIt.user.js
// ==/UserScript==


(function() {
	'use strict';


	/**
 	* Adds a "Copy Ticket Info" button to the ticket interface.
 	* Runs every 3 seconds to check if the button exists and prevents duplication.
 	*/
	setInterval(function() {
    	if (document.getElementById('copy_ticket_details_btn')) {
        	return; // Exit if button is already present
    	}


    	var interactiveButtons = document.getElementsByClassName('interaction-buttons');
    	if (interactiveButtons.length > 0) {
        	console.log('Adding copy button');


        	// Create the copy button
        	var button = document.createElement('button');
        	button.appendChild(document.createTextNode('Copy Ticket Info'));
        	button.setAttribute('class', 'awsui-button awsui-button-variant-normal awsui-hover-child-icons awsui_button_vjswe_nb70g_157 awsui_variant-normal_vjswe_nb70g_205);')
        	button.setAttribute('style', 'margin-right: 1rem;')
        	button.setAttribute('id', 'copy_ticket_details_btn');
        	button.addEventListener('click', copyTicketDetailsToClipboard, false);


        	// Insert button into the interface
        	var div = document.createElement('div');
        	div.setAttribute('class', 'edit-issue');
        	div.appendChild(button);
        	interactiveButtons[0].insertBefore(div, interactiveButtons[0].firstChild);
    	}
	}, 3000);


	/**
 	* Copies the ticket title and URL to the clipboard when the copy button is clicked.
 	*/
	function copyTicketDetailsToClipboard() {
    	var text = document.getElementsByClassName('title-container')[0].children[0].innerText + ' {' + document.URL + '}';


    	// Copy text to clipboard
    	GM_setClipboard(text, 'text');
    	showToast("Copied data to clipboard!");


    	// Provide visual feedback via tooltip
    	var button = document.getElementById('copy_ticket_details_btn');
    	button.setAttribute('title', 'Copied data to your clipboard!!');
	}


	/**
 	* Displays a toast popup notification to confirm clipboard actions.
 	* The notification disappears after 2 seconds.
 	*/
	function showToast(message) {
    	var toast = document.createElement('div');
    	toast.innerText = message;


    	// Styling for the toast message
    	toast.style.position = 'fixed';
    	toast.style.bottom = '20px';
    	toast.style.right = '20px';
    	toast.style.background = '#2a2e33';
    	toast.style.color = '#FFF';
    	toast.style.padding = '10px 20px';
    	toast.style.borderRadius = '5px';
    	toast.style.zIndex = '10000';
    	toast.style.fontFamily = 'Tahoma, Verdana, sans-serif';
    	toast.style.fontSize = '14px';
    	toast.style.opacity = '1';
    	toast.style.transition = 'opacity 0.5s ease-in-out';

    	document.body.appendChild(toast);


    	// Remove the toast after a short delay
    	setTimeout(() => {
        	toast.style.opacity = '0';
        	setTimeout(() => toast.remove(), 500);
    	}, 2000);
	}
})();

